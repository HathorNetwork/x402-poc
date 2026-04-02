// x402 Resource Server (Seller)
// A simple API server that sells weather data
// Accepts payment in HTR or a custom token (e.g. hUSDC)
// Uses x402 middleware to gate access

const express = require('express');
const fetch = require('node-fetch');
const config = require('./config');
const { log } = require('./helpers');

const app = express();
app.use(express.json());

// CORS — allow browser dApps to call this server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Payment');
  res.header('Access-Control-Expose-Headers', 'X-Payment-Response');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Build the list of accepted payment options
function buildAcceptsList(path) {
  const base = {
    scheme: 'hathor-escrow',
    network: 'hathor:privatenet',
    resource: `http://localhost:${config.resourceServerPort}${path}`,
    mimeType: 'application/json',
    payTo: config.sellerAddress,
    maxTimeoutSeconds: config.escrowDeadlineSeconds,
    extra: {
      facilitatorUrl: `http://localhost:${config.facilitatorPort}`,
      facilitatorAddress: config.facilitatorAddress,
      blueprintId: config.blueprintId,
      deadlineSeconds: config.escrowDeadlineSeconds,
    },
  };

  const accepts = [
    { ...base, asset: config.htrTokenUid, amount: String(config.htrPaymentAmount), description: 'Pay 1.00 HTR' },
  ];

  // If a custom token is configured, offer it as an alternative
  if (config.customTokenUid) {
    accepts.push({
      ...base,
      asset: config.customTokenUid,
      amount: String(config.customTokenPaymentAmount),
      description: 'Or pay 10.00 hUSDC',
    });
  }

  return accepts;
}

// x402 middleware — checks for payment, returns 402 if none
function x402Middleware(req, res, next) {
  const paymentHeader = req.headers['x-payment'];

  if (!paymentHeader) {
    log('RESOURCE-SERVER', `402 — No payment for ${req.path}`);
    return res.status(402).json({
      accepts: buildAcceptsList(req.path),
      version: '1',
    });
  }

  // Payment present — verify it
  const payment = JSON.parse(paymentHeader);
  req.x402Payment = payment;
  next();
}

// Find which accepted option the client paid with by querying the facilitator.
// The server sends ALL accepted options and the facilitator checks which one matches.
function buildPaymentRequirements(path) {
  return buildAcceptsList(path).map(opt => ({
    scheme: opt.scheme,
    network: opt.network,
    maxAmountRequired: opt.amount,
    payTo: opt.payTo,
    asset: opt.asset,
  }));
}

// Verify payment with facilitator, serve resource, then settle
app.get('/weather', x402Middleware, async (req, res) => {
  const payment = req.x402Payment;
  const { ncId } = payment.payload;

  log('RESOURCE-SERVER', `Verifying payment ncId=${ncId}`);

  // Build all accepted payment requirements — the facilitator will match
  // the on-chain escrow state against each one to find a valid match
  const allRequirements = buildPaymentRequirements(req.path);

  // Step 1: Verify with facilitator
  const verifyResp = await fetch(`http://localhost:${config.facilitatorPort}/x402/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload: payment,
      paymentRequirements: allRequirements,
    }),
  });
  const verification = await verifyResp.json();

  if (!verification.valid) {
    log('RESOURCE-SERVER', `Payment INVALID: ${verification.invalidReason}`);
    return res.status(402).json({ error: 'Payment invalid', reason: verification.invalidReason });
  }

  log('RESOURCE-SERVER', `Payment VALID — serving resource`);

  // Step 2: Serve the resource
  const weatherData = {
    location: 'Sao Paulo, Brazil',
    temperature: 28,
    humidity: 65,
    condition: 'Partly cloudy',
    wind: '12 km/h NE',
    forecast: 'Warm with chance of afternoon showers',
    timestamp: new Date().toISOString(),
  };

  // Step 3: Settle with facilitator (async — don't block response)
  log('RESOURCE-SERVER', `Requesting settlement for ncId=${ncId}`);
  fetch(`http://localhost:${config.facilitatorPort}/x402/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload: payment,
    }),
  })
    .then(r => r.json())
    .then(result => {
      if (result.success) {
        log('RESOURCE-SERVER', `Settlement complete — txId=${result.txId}`);
      } else {
        log('RESOURCE-SERVER', `Settlement FAILED: ${result.error}`);
      }
    })
    .catch(err => log('RESOURCE-SERVER', `Settlement error: ${err.message}`));

  // Return the resource immediately after verification
  res.json({
    data: weatherData,
    payment: {
      success: true,
      scheme: 'hathor-escrow',
      network: 'hathor:privatenet',
      ncId,
    },
  });
});

app.listen(config.resourceServerPort, () => {
  log('RESOURCE-SERVER', `Weather API running on port ${config.resourceServerPort}`);
  log('RESOURCE-SERVER', `Seller address: ${config.sellerAddress}`);
  log('RESOURCE-SERVER', `Accepts: HTR (${config.htrPaymentAmount} cents)${config.customTokenUid ? `, hUSDC (${config.customTokenPaymentAmount} cents)` : ''}`);
});
