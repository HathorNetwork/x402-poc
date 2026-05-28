// x402 Facilitator — thin, read-only HTTP wrapper around verifier.js.
//
// This binary is optional in the new design. A resource server with a
// fullnode connection can self-verify (see resource-server.js, VERIFY_MODE).
// The facilitator exists for the case where multiple resource servers want
// to share a dedup/blocklist store, or where a seller wants to outsource the
// verification step.
//
// No wallet. No seed. No nano-contract knowledge. No on-chain settlement.

'use strict';

const express = require('express');
const config = require('./config');
const { log } = require('./helpers');
const { openStore } = require('./dedupStore');
const { verifyDirectPayment } = require('./verifier');

if (!config.serverSecret) {
  log('FACILITATOR', 'WARNING: SERVER_SECRET not set — requestId verification will reject everything');
}

const store = openStore(config.dedupDbPath);
const app = express();
app.use(express.json({ limit: '32kb' }));

// CORS — facilitator is called server-to-server, but allow browsers too for
// development tooling.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function pickRequirement(requirements, scheme) {
  if (Array.isArray(requirements)) {
    const match = requirements.find((r) => r && r.scheme === scheme);
    return match || requirements[0];
  }
  return requirements;
}

app.post('/x402/verify', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body || {};
  if (!paymentPayload || !paymentRequirements) {
    return res.status(400).json({ x402Version: 2, valid: false, invalidReason: 'missing_fields' });
  }
  const requirement = pickRequirement(paymentRequirements, paymentPayload.scheme);

  try {
    const result = await verifyDirectPayment({
      payload: paymentPayload,
      requirements: requirement,
      fullnodeUrl: config.fullnodeUrl,
      dedupStore: store,
      serverSecret: config.serverSecret,
      zeroConfMaxAmount: config.zeroConfMaxAmount,
    });
    log('FACILITATOR', `verify ${result.valid ? 'PASSED' : 'FAILED'}${result.invalidReason ? `: ${result.invalidReason}` : ''}${result.idempotent ? ' (idempotent)' : ''}`);
    return res.json({ x402Version: 2, ...result });
  } catch (err) {
    log('FACILITATOR', `verify error: ${err.message}`);
    return res.status(500).json({ x402Version: 2, valid: false, invalidReason: 'verifier_error' });
  }
});

// Settle is a no-op for hathor-direct: the payment is already on-chain. We
// re-verify (which is idempotent thanks to the dedup row) and echo a v2-style
// settlement response.
app.post('/x402/settle', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body || {};
  if (!paymentPayload || !paymentRequirements) {
    return res.status(400).json({ x402Version: 2, success: false, errorReason: 'missing_fields' });
  }
  const requirement = pickRequirement(paymentRequirements, paymentPayload.scheme);

  try {
    const result = await verifyDirectPayment({
      payload: paymentPayload,
      requirements: requirement,
      fullnodeUrl: config.fullnodeUrl,
      dedupStore: store,
      serverSecret: config.serverSecret,
      zeroConfMaxAmount: config.zeroConfMaxAmount,
    });
    if (!result.valid) {
      return res.json({
        x402Version: 2,
        success: false,
        errorReason: result.invalidReason,
        transaction: '',
        network: requirement.network,
      });
    }
    return res.json({
      x402Version: 2,
      success: true,
      scheme: paymentPayload.scheme,
      network: requirement.network,
      transaction: result.txId,
      amount: String(result.amount),
      payer: result.payerAddress,
    });
  } catch (err) {
    return res.status(500).json({
      x402Version: 2,
      success: false,
      errorReason: 'verifier_error',
      transaction: '',
      network: requirement && requirement.network,
    });
  }
});

// Discovery — advertise the scheme/network pairs we'll handle.
app.get('/supported', (_req, res) => {
  res.json({
    x402Version: 2,
    kinds: [
      { x402Version: 2, scheme: 'hathor-direct', network: `hathor:${config.network}` },
      { x402Version: 2, scheme: 'hathor-direct-upto', network: `hathor:${config.network}` },
    ],
    extensions: [],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    network: config.network,
    fullnodeUrl: config.fullnodeUrl,
    dedup: store.stats(),
    uptime: process.uptime(),
  });
});

app.listen(config.facilitatorPort, () => {
  log('FACILITATOR', `Running on :${config.facilitatorPort} — network=${config.network}, fullnode=${config.fullnodeUrl}`);
  log('FACILITATOR', `Dedup store: ${config.dedupDbPath}`);
});
