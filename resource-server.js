// x402 Resource Server (Seller)
// A simple API server that sells:
//   GET /weather  -> exact scheme (hathor-escrow / hathor-channel)
//   GET /generate -> upto scheme (hathor-escrow-upto) — usage-billed (simulated LLM)
// Supports HTR and custom tokens

const express = require('express');
const fetch = require('node-fetch');
const config = require('./config');
const { log } = require('./helpers');

const app = express();
app.use(express.json());

// CORS — allow browser dApps to call this server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE, X-Payment');
  res.header('Access-Control-Expose-Headers', 'PAYMENT-RESPONSE, X-Payment-Response');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Build the list of accepted payment options for a route.
// `routeConfig` describes the pricing mode for that route:
//   { mode: 'exact', price }          -> one-shot escrow or channel
//   { mode: 'upto',  maxPrice }       -> upto-scheme escrow (server settles actual usage)
function buildAcceptsList(path, routeConfig) {
  const baseExtra = {
    facilitatorUrl: config.facilitatorPublicUrl,
    facilitatorAddress: config.facilitatorAddress,
    deadlineSeconds: config.escrowDeadlineSeconds,
  };

  const accepts = [];

  if (routeConfig.mode === 'upto') {
    // Usage-based: client authorizes up to maxPrice, server settles actual usage.
    accepts.push({
      scheme: 'hathor-escrow-upto',
      network: `hathor:${config.network}`,
      resource: `${config.resourceServerPublicUrl}${path}`,
      mimeType: 'application/json',
      payTo: config.sellerAddress,
      maxTimeoutSeconds: config.escrowDeadlineSeconds,
      asset: config.htrTokenUid,
      price: String(routeConfig.maxPrice),
      description: `Pay up to ${(routeConfig.maxPrice / 100).toFixed(2)} HTR — billed by actual usage`,
      extra: { ...baseExtra, blueprintId: config.blueprintId, pricing: 'upto' },
    });
    return accepts;
  }

  // Default: exact pricing (escrow + optional channel)
  const price = routeConfig.price;

  accepts.push({
    scheme: 'hathor-escrow',
    network: `hathor:${config.network}`,
    resource: `${config.resourceServerPublicUrl}${path}`,
    mimeType: 'application/json',
    payTo: config.sellerAddress,
    maxTimeoutSeconds: config.escrowDeadlineSeconds,
    asset: config.htrTokenUid,
    price: String(price),
    description: `Pay ${(price / 100).toFixed(2)} HTR (single escrow)`,
    extra: { ...baseExtra, blueprintId: config.blueprintId, pricing: 'exact' },
  });

  if (config.channelBlueprintId) {
    accepts.push({
      scheme: 'hathor-channel',
      network: `hathor:${config.network}`,
      resource: `${config.resourceServerPublicUrl}${path}`,
      mimeType: 'application/json',
      payTo: config.sellerAddress,
      maxTimeoutSeconds: config.escrowDeadlineSeconds,
      asset: config.htrTokenUid,
      price: String(price),
      description: `Pay ${(price / 100).toFixed(2)} HTR via channel (saves escrow creation)`,
      extra: { ...baseExtra, channelBlueprintId: config.channelBlueprintId, pricing: 'exact' },
    });
  }

  return accepts;
}

// Handlers call res.setSettlementOverrides({ amount }) during request processing
// to specify the actual amount to charge in the "upto" scheme. Ignored by "exact".
function setSettlementOverrides(res, overrides) {
  res.locals.x402SettlementOverrides = {
    ...(res.locals.x402SettlementOverrides || {}),
    ...overrides,
  };
}

// Factory: build a middleware that verifies payment up-front and defers
// settlement until after the route handler has finished (so handlers can
// call setSettlementOverrides() for the "upto" scheme).
function x402Middleware(routeConfig) {
  const paymentRequirements = buildAcceptsList('', routeConfig).map(opt => ({
    scheme: opt.scheme,
    network: opt.network,
    maxAmountRequired: opt.price,
    payTo: opt.payTo,
    asset: opt.asset,
  }));

  return async function (req, res, next) {
    // x402 V2: PAYMENT-SIGNATURE (Base64-encoded JSON), fallback to X-Payment (raw JSON) for backward compat
    const signatureHeader = req.headers['payment-signature'];
    const legacyHeader = req.headers['x-payment'];

    if (!signatureHeader && !legacyHeader) {
      log('RESOURCE-SERVER', `402 — No payment for ${req.path}`);
      return res.status(402).json({
        x402Version: 2,
        accepts: buildAcceptsList(req.path, routeConfig),
      });
    }

    let payment;
    try {
      payment = signatureHeader
        ? JSON.parse(Buffer.from(signatureHeader, 'base64').toString('utf-8'))
        : JSON.parse(legacyHeader);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid PAYMENT-SIGNATURE header' });
    }

    const scheme = payment.scheme;
    const isChannel = scheme === 'hathor-channel';
    const isUpto = scheme === 'hathor-escrow-upto';
    const id = isChannel ? payment.payload.channelId : payment.payload.ncId;

    log('RESOURCE-SERVER', `Verifying ${scheme} payment id=${id}`);

    // Step 1: Verify with facilitator (up-front, before running the handler)
    const verifyResp = await fetch(`${config.facilitatorUrl}/x402/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload: payment, paymentRequirements }),
    });
    const verification = await verifyResp.json();

    if (!verification.valid) {
      log('RESOURCE-SERVER', `Payment INVALID: ${verification.invalidReason}`);
      return res.status(402).json({ error: 'Payment invalid', reason: verification.invalidReason });
    }
    log('RESOURCE-SERVER', `Payment VALID`);

    // Stash context for post-handler settlement
    res.locals.x402 = { payment, scheme, isChannel, isUpto, id, routeConfig };

    // Hook res.json so we can settle AFTER the handler finishes building its payload.
    // This lets "upto" handlers compute actual usage and call setSettlementOverrides().
    const originalJson = res.json.bind(res);
    res.json = async function (body) {
      // Only settle on 2xx responses — skip if the handler returned an error.
      if (res.statusCode >= 400) {
        return originalJson(body);
      }
      try {
        const { chargedAmount, settlement } = await settlePayment(res);
        const paymentResponse = {
          x402Version: 2,
          success: true,
          scheme,
          network: `hathor:${config.network}`,
          ...(isChannel ? { channelId: id } : { ncId: id }),
          settleTxId: settlement.txId,
          ...(isUpto ? { chargedAmount, refundAmount: settlement.refundAmount, refundTxId: settlement.refundTxId } : {}),
        };
        res.set('PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paymentResponse)).toString('base64'));
        return originalJson({ data: body, payment: paymentResponse });
      } catch (err) {
        log('RESOURCE-SERVER', `Settlement FAILED: ${err.message}`);
        // Use originalJson directly to avoid recursion through the wrapped res.json
        res.status(500);
        return originalJson({ error: 'Settlement failed', reason: err.message });
      }
    };

    next();
  };
}

// Internal: call the facilitator to settle. Picks the right shape based on scheme.
async function settlePayment(res) {
  const { payment, scheme, isChannel, isUpto, id, routeConfig } = res.locals.x402;
  const overrides = res.locals.x402SettlementOverrides || {};

  const settleBody = { paymentPayload: payment };
  let chargedAmount;

  if (isChannel) {
    settleBody.amount = routeConfig.price;
    settleBody.sellerAddress = config.sellerAddress;
    chargedAmount = routeConfig.price;
  } else if (isUpto) {
    // Handler MUST call setSettlementOverrides({ amount }) — otherwise charge the full max.
    chargedAmount = overrides.amount != null ? parseInt(overrides.amount) : routeConfig.maxPrice;
    if (chargedAmount > routeConfig.maxPrice) chargedAmount = routeConfig.maxPrice;
    if (chargedAmount < 1) chargedAmount = 1;
    settleBody.chargedAmount = chargedAmount;
  } else {
    chargedAmount = routeConfig.price;
  }

  log('RESOURCE-SERVER', `Settling ${scheme} id=${id}${isUpto ? ` chargedAmount=${chargedAmount}` : ''}`);
  const settleResp = await fetch(`${config.facilitatorUrl}/x402/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settleBody),
  });
  const settlement = await settleResp.json();

  if (!settlement.success) {
    throw new Error(settlement.error || 'settle failed');
  }
  log('RESOURCE-SERVER', `Settlement confirmed — txId=${settlement.txId}`);
  return { chargedAmount, settlement };
}

// ----- Routes -----

// EXACT scheme: classic fixed-price endpoint
app.get('/weather', x402Middleware({ mode: 'exact', price: config.htrPaymentAmount }), async (req, res) => {
  const weatherData = {
    location: 'Sao Paulo, Brazil',
    temperature: 28,
    humidity: 65,
    condition: 'Partly cloudy',
    wind: '12 km/h NE',
    forecast: 'Warm with chance of afternoon showers',
    timestamp: new Date().toISOString(),
  };
  res.json(weatherData);
});

// UPTO scheme: usage-based endpoint (simulated LLM generation)
// Client authorizes up to `maxPrice`; server charges based on tokens actually generated.
const GENERATE_MAX_PRICE = parseInt(process.env.GENERATE_MAX_PRICE || '500'); // 5.00 HTR
const GENERATE_PRICE_PER_TOKEN = 1; // 0.01 HTR per token generated

app.get('/generate', x402Middleware({ mode: 'upto', maxPrice: GENERATE_MAX_PRICE }), async (req, res) => {
  // Simulate variable LLM token usage between 50 and GENERATE_MAX_PRICE/PRICE_PER_TOKEN tokens
  const maxTokens = Math.floor(GENERATE_MAX_PRICE / GENERATE_PRICE_PER_TOKEN);
  const tokensUsed = Math.floor(50 + Math.random() * (maxTokens - 50));
  const actualCost = tokensUsed * GENERATE_PRICE_PER_TOKEN;

  // Tell the middleware how much to actually charge
  setSettlementOverrides(res, { amount: actualCost });

  const prompt = req.query.prompt || 'default prompt';
  res.json({
    prompt,
    completion: `Generated response for: "${prompt}". This mock response simulates variable-length LLM output billed per token.`,
    usage: {
      tokensUsed,
      pricePerToken: GENERATE_PRICE_PER_TOKEN,
      authorizedMaxAtomic: GENERATE_MAX_PRICE,
      actualChargedAtomic: actualCost,
    },
    timestamp: new Date().toISOString(),
  });
});

app.listen(config.resourceServerPort, () => {
  log('RESOURCE-SERVER', `Paid API running on port ${config.resourceServerPort}`);
  log('RESOURCE-SERVER', `Seller address: ${config.sellerAddress}`);
  log('RESOURCE-SERVER', `Routes:`);
  log('RESOURCE-SERVER', `  GET /weather  — exact:  ${(config.htrPaymentAmount / 100).toFixed(2)} HTR`);
  log('RESOURCE-SERVER', `  GET /generate — upto:   up to ${(GENERATE_MAX_PRICE / 100).toFixed(2)} HTR (usage-billed)`);
  log('RESOURCE-SERVER', `Schemes: hathor-escrow${config.channelBlueprintId ? ' + hathor-channel' : ''} + hathor-escrow-upto`);
});
