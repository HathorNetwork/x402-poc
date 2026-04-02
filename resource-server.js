// x402 Resource Server (Seller)
// A simple API server that sells weather data
// Accepts payment via escrow (hathor-escrow) or channel (hathor-channel)
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
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Payment');
  res.header('Access-Control-Expose-Headers', 'X-Payment-Response');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Build the list of accepted payment options (escrow + channel)
function buildAcceptsList(path) {
  const baseExtra = {
    facilitatorUrl: `${config.facilitatorUrl}`,
    facilitatorAddress: config.facilitatorAddress,
    deadlineSeconds: config.escrowDeadlineSeconds,
  };

  const accepts = [];

  // Escrow option
  accepts.push({
    scheme: 'hathor-escrow',
    network: 'hathor:privatenet',
    resource: `http://localhost:${config.resourceServerPort}${path}`,
    mimeType: 'application/json',
    payTo: config.sellerAddress,
    maxTimeoutSeconds: config.escrowDeadlineSeconds,
    asset: config.htrTokenUid,
    amount: String(config.htrPaymentAmount),
    description: `Pay ${(config.htrPaymentAmount / 100).toFixed(2)} HTR (single escrow)`,
    extra: { ...baseExtra, blueprintId: config.blueprintId },
  });

  // Channel option
  if (config.channelBlueprintId) {
    accepts.push({
      scheme: 'hathor-channel',
      network: 'hathor:privatenet',
      resource: `http://localhost:${config.resourceServerPort}${path}`,
      mimeType: 'application/json',
      payTo: config.sellerAddress,
      maxTimeoutSeconds: config.escrowDeadlineSeconds,
      asset: config.htrTokenUid,
      amount: String(config.htrPaymentAmount),
      description: `Pay ${(config.htrPaymentAmount / 100).toFixed(2)} HTR via channel (saves escrow creation)`,
      extra: { ...baseExtra, channelBlueprintId: config.channelBlueprintId },
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

  const payment = JSON.parse(paymentHeader);
  req.x402Payment = payment;
  next();
}

function buildPaymentRequirements(path) {
  return buildAcceptsList(path).map(opt => ({
    scheme: opt.scheme,
    network: opt.network,
    maxAmountRequired: opt.amount,
    payTo: opt.payTo,
    asset: opt.asset,
  }));
}

// Verify + settle + serve
app.get('/weather', x402Middleware, async (req, res) => {
  const payment = req.x402Payment;
  const scheme = payment.scheme;
  const isChannel = scheme === 'hathor-channel';
  const id = isChannel ? payment.payload.channelId : payment.payload.ncId;

  log('RESOURCE-SERVER', `Verifying ${scheme} payment id=${id}`);

  // Step 1: Verify with facilitator
  const allRequirements = buildPaymentRequirements(req.path);
  const verifyResp = await fetch(`${config.facilitatorUrl}/x402/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentPayload: payment, paymentRequirements: allRequirements }),
  });
  const verification = await verifyResp.json();

  if (!verification.valid) {
    log('RESOURCE-SERVER', `Payment INVALID: ${verification.invalidReason}`);
    return res.status(402).json({ error: 'Payment invalid', reason: verification.invalidReason });
  }

  log('RESOURCE-SERVER', `Payment VALID`);

  // Step 2: Settle BEFORE serving the resource
  // For channels: spend() must confirm so on-chain state is updated before next request
  // For escrow: release() must confirm so funds reach the seller
  log('RESOURCE-SERVER', `Settling ${scheme} id=${id}`);
  const settleBody = { paymentPayload: payment };
  if (isChannel) {
    settleBody.amount = config.htrPaymentAmount;
    settleBody.sellerAddress = config.sellerAddress;
  }

  const settleResp = await fetch(`${config.facilitatorUrl}/x402/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settleBody),
  });
  const settlement = await settleResp.json();

  if (!settlement.success) {
    log('RESOURCE-SERVER', `Settlement FAILED: ${settlement.error}`);
    return res.status(500).json({ error: 'Settlement failed', reason: settlement.error });
  }

  log('RESOURCE-SERVER', `Settlement confirmed — txId=${settlement.txId}`);

  // Step 3: Serve the resource (only after settlement is confirmed)
  const weatherData = {
    location: 'Sao Paulo, Brazil',
    temperature: 28,
    humidity: 65,
    condition: 'Partly cloudy',
    wind: '12 km/h NE',
    forecast: 'Warm with chance of afternoon showers',
    timestamp: new Date().toISOString(),
  };

  res.json({
    data: weatherData,
    payment: {
      success: true,
      scheme,
      network: 'hathor:privatenet',
      id,
      settleTxId: settlement.txId,
    },
  });
});

app.listen(config.resourceServerPort, () => {
  log('RESOURCE-SERVER', `Weather API running on port ${config.resourceServerPort}`);
  log('RESOURCE-SERVER', `Seller address: ${config.sellerAddress}`);
  log('RESOURCE-SERVER', `Accepts: escrow${config.channelBlueprintId ? ' + channel' : ''}`);
});
