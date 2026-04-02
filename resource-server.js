// x402 Resource Server (Seller)
// A simple API server that sells weather data for 1 HTR per request
// Uses x402 middleware to gate access

const express = require('express');
const fetch = require('node-fetch');
const config = require('./config');
const { log } = require('./helpers');

const app = express();
app.use(express.json());

// x402 middleware — checks for payment, returns 402 if none
function x402Middleware(req, res, next) {
  const paymentHeader = req.headers['x-payment'];

  if (!paymentHeader) {
    // No payment — return 402 with payment requirements
    log('RESOURCE-SERVER', `402 — No payment for ${req.path}`);
    return res.status(402).json({
      accepts: [{
        scheme: 'hathor-escrow',
        network: 'hathor:privatenet',
        maxAmountRequired: String(config.paymentAmount),
        resource: `http://localhost:${config.resourceServerPort}${req.path}`,
        description: 'Pay 1.00 HTR to access weather data',
        mimeType: 'application/json',
        payTo: config.sellerAddress,
        tokenUid: config.htrTokenUid,
        maxTimeoutSeconds: config.escrowDeadlineSeconds,
        extra: {
          facilitatorUrl: `http://localhost:${config.facilitatorPort}`,
          facilitatorAddress: config.facilitatorAddress,
          blueprintId: config.blueprintId,
          deadlineSeconds: config.escrowDeadlineSeconds,
        },
      }],
      version: '1',
    });
  }

  // Payment present — verify it
  const payment = JSON.parse(paymentHeader);
  req.x402Payment = payment;
  next();
}

// Verify payment with facilitator, serve resource, then settle
app.get('/weather', x402Middleware, async (req, res) => {
  const payment = req.x402Payment;
  const { ncId } = payment.payload;

  log('RESOURCE-SERVER', `Verifying payment ncId=${ncId}`);

  // Step 1: Verify with facilitator
  const verifyResp = await fetch(`http://localhost:${config.facilitatorPort}/x402/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload: payment,
      paymentRequirements: {
        scheme: 'hathor-escrow',
        network: 'hathor:privatenet',
        maxAmountRequired: String(config.paymentAmount),
        payTo: config.sellerAddress,
        tokenUid: config.htrTokenUid,
      },
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
  log('RESOURCE-SERVER', `Price: ${config.paymentAmount} cents HTR per request`);
});
