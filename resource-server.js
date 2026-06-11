// x402 Resource Server — sells two routes:
//   GET /weather  — hathor-direct (exact)
//   GET /generate — hathor-direct-upto (max-authorize, refund remainder)
//
// Self-verifies via verifier.js by default (VERIFY_MODE=self) so a public
// facilitator is optional. When VERIFY_MODE=facilitator it POSTs to the
// configured facilitator URL instead.

'use strict';

const express = require('express');
const config = require('./config');
const { log } = require('./helpers');
const { openStore } = require('./dedupStore');
const { mintRequestId } = require('./requestId');
const { verifyDirectPayment } = require('./verifier');
const { watchForVoid } = require('./voidWatcher');
const { issueRefund } = require('./refundIssuer');

if (!config.sellerAddress) {
  log('RESOURCE-SERVER', 'WARNING: SELLER_ADDRESS not set — 402 responses will be invalid');
}
if (!config.serverSecret) {
  log('RESOURCE-SERVER', 'WARNING: SERVER_SECRET not set — requestIds will be unverifiable');
}

const store = openStore(config.dedupDbPath);
const app = express();
app.use(express.json({ limit: '32kb' }));

// CORS — open for the dApp + curl tests.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE');
  res.header('Access-Control-Expose-Headers', 'PAYMENT-RESPONSE');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// 402 building
// ---------------------------------------------------------------------------

function networkId() {
  return `hathor:${config.network}`;
}

function buildAccept(req, routeConfig) {
  const resourceUrl = `${config.resourceServerPublicUrl}${req.path}`;
  const amount = String(routeConfig.mode === 'upto' ? routeConfig.maxPrice : routeConfig.price);
  const scheme = routeConfig.mode === 'upto' ? 'hathor-direct-upto' : 'hathor-direct';
  const asset = routeConfig.asset || config.htrTokenUid;
  const symbol = routeConfig.symbol || 'HTR';

  // Mint a fresh, server-issued challenge token. The HMAC commitments include
  // the route, amount, and payTo so a payment claim later can't be redirected.
  // config.serverSecret always has a value (env or fixed dev fallback) so
  // mint+verify use the same key.
  const requestId = mintRequestId(
    {
      route: resourceUrl,
      amount,
      payTo: config.sellerAddress,
      asset,
      network: networkId(),
    },
    config.serverSecret,
    config.requestIdTtlSeconds
  );

  const description = routeConfig.mode === 'upto'
    ? `Pay up to ${(routeConfig.maxPrice / 100).toFixed(2)} ${symbol} — billed by actual usage, remainder refunded`
    : `Pay ${(routeConfig.price / 100).toFixed(2)} ${symbol}`;

  return {
    scheme,
    network: networkId(),
    amount,
    asset,
    payTo: config.sellerAddress,
    resource: resourceUrl,
    maxTimeoutSeconds: config.requestIdTtlSeconds,
    description,
    extra: {
      requestId,
      facilitatorUrl: config.verifyMode === 'facilitator' ? config.facilitatorUrl : undefined,
    },
  };
}

function build402Body(req, routeConfig) {
  return {
    x402Version: 2,
    accepts: [buildAccept(req, routeConfig)],
  };
}

// ---------------------------------------------------------------------------
// Verify — either local (verifier.js) or via the standalone facilitator
// ---------------------------------------------------------------------------

async function runVerify(paymentPayload, requirement) {
  if (config.verifyMode === 'facilitator') {
    const resp = await fetch(`${config.facilitatorUrl}/x402/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload, paymentRequirements: requirement }),
    });
    return resp.json();
  }
  return verifyDirectPayment({
    payload: paymentPayload,
    requirements: requirement,
    fullnodeUrl: config.fullnodeUrl,
    dedupStore: store,
    serverSecret: config.serverSecret,
    zeroConfMaxAmount: config.zeroConfMaxAmount,
  });
}

// Handlers call `setUptoChargedAmount(res, n)` from inside the route to tell
// the middleware what actually to charge (in atomic units). Ignored by the
// exact scheme.
function setUptoChargedAmount(res, amount) {
  res.locals.x402UptoCharged = amount;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function x402Middleware(routeConfig) {
  return async function middleware(req, res, next) {
    const signatureHeader = req.headers['payment-signature'];

    if (!signatureHeader) {
      log('RESOURCE-SERVER', `402 — no PAYMENT-SIGNATURE for ${req.path}`);
      return res.status(402).json(build402Body(req, routeConfig));
    }

    let payment;
    try {
      payment = JSON.parse(Buffer.from(signatureHeader, 'base64').toString('utf-8'));
    } catch (_) {
      return res.status(400).json({ error: 'invalid_payment_signature_header' });
    }

    // Re-issue a requestId-bound requirement so the verifier checks against
    // the canonical route values, not anything the client could spoof.
    const requirement = (() => {
      const accept = buildAccept(req, routeConfig);
      // Verifier uses what the payload claims and re-checks the HMAC; we just
      // pass the canonical route/payTo/amount/asset/network back in.
      return {
        scheme: accept.scheme,
        network: accept.network,
        amount: accept.amount,
        asset: accept.asset,
        payTo: accept.payTo,
        resource: accept.resource,
      };
    })();

    log('RESOURCE-SERVER', `verifying ${payment.scheme} for ${req.path}`);
    let verification;
    try {
      verification = await runVerify(payment, requirement);
    } catch (err) {
      log('RESOURCE-SERVER', `verify error: ${err.message}`);
      return res.status(502).json({ error: 'verify_failed', reason: err.message });
    }

    if (!verification.valid) {
      log('RESOURCE-SERVER', `payment INVALID: ${verification.invalidReason}`);
      return res.status(402).json({
        error: 'payment_invalid',
        reason: verification.invalidReason,
        ...build402Body(req, routeConfig),
      });
    }

    log('RESOURCE-SERVER', `payment VALID — tx=${verification.txId} idempotent=${!!verification.idempotent}`);
    res.locals.x402 = { payment, verification, routeConfig, requirement };

    // Hook res.json to settle (refund) AFTER the handler has produced a body
    // so /generate can call setUptoChargedAmount() to specify actual usage.
    const originalJson = res.json.bind(res);
    res.json = async function patched(body) {
      try {
        const { paymentResponse } = await finalizeUpto(res);
        if (paymentResponse) {
          res.set('PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paymentResponse)).toString('base64'));
        }
        // Start the void watcher only after we've committed to the response
        // (so a verification failure doesn't accidentally arm one).
        if (!verification.idempotent) {
          watchForVoid({
            txId: verification.txId,
            outputIndex: verification.outputIndex,
            payerAddress: verification.payerAddress,
            store,
            log,
          });
        }
        return originalJson({ data: body, payment: paymentResponse });
      } catch (err) {
        log('RESOURCE-SERVER', `settlement failed: ${err.message}`);
        res.status(500);
        return originalJson({ error: 'settlement_failed', reason: err.message });
      }
    };

    next();
  };
}

async function finalizeUpto(res) {
  const ctx = res.locals.x402;
  const { payment, verification, routeConfig } = ctx;
  const scheme = payment.scheme;
  const paidAmount = Number(verification.paidAmount);

  // Exact scheme — no refund, simple PAYMENT-RESPONSE.
  if (scheme === 'hathor-direct') {
    return {
      paymentResponse: {
        x402Version: 2,
        success: true,
        scheme,
        network: `hathor:${config.network}`,
        transaction: verification.txId,
        amount: String(paidAmount),
        payer: verification.payerAddress,
      },
    };
  }

  // Upto scheme — clamp charged amount and issue a refund tx if there's
  // remainder. Handler should have called setUptoChargedAmount(res, n).
  let charged = Number(res.locals.x402UptoCharged);
  if (!Number.isFinite(charged) || charged <= 0) charged = paidAmount; // default to full
  if (charged > paidAmount) charged = paidAmount;
  const refund = paidAmount - charged;

  let refundTxId = null;
  let refundError = null;

  if (refund > 0) {
    try {
      const r = await issueRefund({
        sellerWalletUrl: config.sellerWalletUrl,
        sellerWalletId: config.sellerWalletId,
        refundAddress: verification.payerAddress,
        amount: refund,
        asset: verification.asset,
        log,
      });
      refundTxId = r.txId;
    } catch (err) {
      refundError = err.message;
      log('RESOURCE-SERVER', `refund FAILED: ${err.message}`);
    }
  }

  // Best-effort persistence of the upto settlement on the dedup row.
  try {
    store.attachUptoSettlement(
      verification.txId,
      verification.outputIndex,
      charged,
      refundTxId
    );
  } catch (_) { /* don't block the response on accounting */ }

  return {
    paymentResponse: {
      x402Version: 2,
      success: true,
      scheme,
      network: `hathor:${config.network}`,
      transaction: verification.txId,
      amount: String(paidAmount),
      chargedAmount: String(charged),
      refundAmount: String(refund),
      refundTxId,
      refundError,
      payer: verification.payerAddress,
    },
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Exact: GET /weather
app.get(
  '/weather',
  x402Middleware({ mode: 'exact', price: config.htrPaymentAmount }),
  async (_req, res) => {
    res.json({
      location: 'Sao Paulo, Brazil',
      temperature: 28,
      humidity: 65,
      condition: 'Partly cloudy',
      wind: '12 km/h NE',
      forecast: 'Warm with chance of afternoon showers',
      timestamp: new Date().toISOString(),
    });
  }
);

// Upto: GET /generate — simulated LLM with variable usage
const GENERATE_PRICE_PER_TOKEN = 1; // 0.01 HTR per token

app.get(
  '/generate',
  x402Middleware({ mode: 'upto', maxPrice: config.generateMaxPrice }),
  async (req, res) => {
    const maxTokens = Math.floor(config.generateMaxPrice / GENERATE_PRICE_PER_TOKEN);
    const tokensUsed = Math.floor(50 + Math.random() * Math.max(1, maxTokens - 50));
    const actualCost = Math.max(1, tokensUsed * GENERATE_PRICE_PER_TOKEN);

    // Tell the middleware what to actually charge.
    setUptoChargedAmount(res, actualCost);

    const prompt = req.query.prompt || 'default prompt';
    res.json({
      prompt,
      completion: `Generated response for: "${prompt}". This mock simulates variable-length LLM output billed per token.`,
      usage: {
        tokensUsed,
        pricePerToken: GENERATE_PRICE_PER_TOKEN,
        authorizedMaxAtomic: config.generateMaxPrice,
        actualChargedAtomic: actualCost,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ---------------------------------------------------------------------------
// Playground routes — exact scheme priced in the configured custom token
// (PAYMENT_TOKEN_UID / PAYMENT_TOKEN_SYMBOL, e.g. hUSDC on testnet). Response
// shapes match what the Agent Playground dapp renders.
// ---------------------------------------------------------------------------

const playgroundToken = {
  asset: config.paymentTokenUid,
  symbol: config.paymentTokenSymbol,
};

// Exact: GET /api/weather — 1 atomic unit (0.01 hUSDC)
app.get(
  '/api/weather',
  x402Middleware({ mode: 'exact', price: 1, ...playgroundToken }),
  async (_req, res) => {
    res.json({
      city: 'São Paulo',
      temp_c: 24,
      feels_like_c: 26,
      conditions: 'Partly Cloudy',
      humidity: 63,
      wind: { speed_kmh: 12, direction: 'NE' },
      forecast: [
        { day: 'Tomorrow', high: 27, low: 19, conditions: 'Sunny' },
        { day: 'In 2 days', high: 25, low: 18, conditions: 'Partly Cloudy' },
        { day: 'In 3 days', high: 22, low: 17, conditions: 'Rain Showers' },
      ],
      timestamp: new Date().toISOString(),
    });
  }
);

// Exact: GET /api/market-data — 10 atomic units (0.10 hUSDC)
app.get(
  '/api/market-data',
  x402Middleware({ mode: 'exact', price: 10, ...playgroundToken }),
  async (_req, res) => {
    res.json({
      base: 'USD',
      prices: {
        HTR: { price: 0.041, change_24h_pct: 3.4 },
        BTC: { price: 104250.0, change_24h_pct: -1.2 },
        ETH: { price: 5230.5, change_24h_pct: 0.8 },
      },
      updated_at: new Date().toISOString(),
    });
  }
);

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    seller: config.sellerAddress,
    verifyMode: config.verifyMode,
    network: config.network,
    dedup: store.stats(),
    uptime: process.uptime(),
  });
});

app.listen(config.resourceServerPort, () => {
  log('RESOURCE-SERVER', `Running on :${config.resourceServerPort}`);
  log('RESOURCE-SERVER', `Seller address: ${config.sellerAddress || '(unset)'}`);
  log('RESOURCE-SERVER', `Verify mode: ${config.verifyMode}${config.verifyMode === 'facilitator' ? ` (${config.facilitatorUrl})` : ''}`);
  log('RESOURCE-SERVER', `Dedup store: ${config.dedupDbPath}`);
  log('RESOURCE-SERVER', `Routes:`);
  log('RESOURCE-SERVER', `  GET /weather  — exact: ${(config.htrPaymentAmount / 100).toFixed(2)} HTR`);
  log('RESOURCE-SERVER', `  GET /generate — upto:  up to ${(config.generateMaxPrice / 100).toFixed(2)} HTR (usage-billed)`);
  log('RESOURCE-SERVER', `  GET /api/weather     — exact: 0.01 ${config.paymentTokenSymbol}`);
  log('RESOURCE-SERVER', `  GET /api/market-data — exact: 0.10 ${config.paymentTokenSymbol}`);
});
