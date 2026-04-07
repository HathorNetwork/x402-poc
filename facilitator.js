// x402 Facilitator Server
// Exposes /x402/verify and /x402/settle endpoints
// Supports both escrow (hathor-escrow) and channel (hathor-channel) schemes
// Talks to hathor-forge fullnode for state queries and wallet-headless for settlement

const express = require('express');
const config = require('./config');
const { walletRequest, getNanoContractState, waitForTxConfirmation, log } = require('./helpers');

const app = express();
app.use(express.json());

// ============================================================================
// Settlement cache for Payment-Identifier idempotency (#8)
// Key: ncId or channelId+amount, Value: settlement result
// ============================================================================
const settlementCache = new Map();

// ============================================================================
// ESCROW verification/settlement (one contract per payment)
// ============================================================================

function validateEscrowAgainstRequirement(fields, req) {
  const errors = [];
  if (fields.phase.value !== 'LOCKED') errors.push(`phase is ${fields.phase.value}, expected LOCKED`);
  if (fields.amount.value < parseInt(req.maxAmountRequired)) errors.push(`amount ${fields.amount.value} < required ${req.maxAmountRequired}`);
  if (fields.seller.value !== req.payTo) errors.push(`seller ${fields.seller.value} != payTo ${req.payTo}`);
  if (fields.facilitator.value !== config.facilitatorAddress) errors.push(`facilitator mismatch`);
  if (req.asset && fields.token_uid.value !== req.asset) errors.push(`token_uid ${fields.token_uid.value} != asset ${req.asset}`);
  return errors;
}

async function verifyEscrow(ncId, requirements) {
  const stateResp = await getNanoContractState(ncId);
  if (!stateResp.success) return { x402Version: 2, valid: false, invalidReason: `Cannot query contract: ${stateResp.message}` };

  const reqs = Array.isArray(requirements) ? requirements : [requirements];
  let lastErrors = [];
  for (const req of reqs) {
    const errors = validateEscrowAgainstRequirement(stateResp.fields, req);
    if (errors.length === 0) return { x402Version: 2, valid: true };
    lastErrors = errors;
  }
  return { x402Version: 2, valid: false, invalidReason: lastErrors.join('; ') };
}

async function settleEscrow(ncId) {
  const stateResp = await getNanoContractState(ncId);
  if (!stateResp.success) return { x402Version: 2, success: false, error: `Cannot query contract` };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'LOCKED') return { x402Version: 2, success: false, error: `Escrow not locked (phase=${fields.phase.value})` };

  const amount = fields.amount.value;
  const seller = fields.seller.value;
  const tokenUid = fields.token_uid.value;

  log('FACILITATOR', `Escrow release() — ${amount} of ${tokenUid} to ${seller}`);
  const result = await walletRequest('POST', '/wallet/nano-contracts/execute', {
    nc_id: ncId,
    method: 'release',
    address: config.facilitatorAddress,
    data: { args: [], actions: [{ type: 'withdrawal', token: tokenUid, amount, address: seller }] },
  }, config.facilitatorWalletId);

  if (!result.success) return { x402Version: 2, success: false, error: result.message || 'release() failed' };
  // Don't wait for block confirmation — tx is accepted by the node, it will confirm eventually
  return { x402Version: 2, success: true, txId: result.hash, network: `hathor:${config.network || 'privatenet'}` };
}

// ============================================================================
// CHANNEL verification/settlement (pre-funded, multiple payments)
// ============================================================================

const CHANNEL_FIELDS = ['buyer', 'facilitator', 'token_uid', 'total_deposited', 'total_spent', 'phase', 'deadline'];

async function getChannelState(channelId) {
  const queryString = CHANNEL_FIELDS.map(f => `fields[]=${f}`).join('&');
  const url = `${config.fullnodeUrl}/v1a/nano_contract/state?id=${channelId}&${queryString}`;
  const resp = await require('node-fetch')(url);
  return resp.json();
}

async function verifyChannel(channelId, requirements) {
  const stateResp = await getChannelState(channelId);
  if (!stateResp.success) return { x402Version: 2, valid: false, invalidReason: `Cannot query channel: ${stateResp.message}` };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'OPEN') return { x402Version: 2, valid: false, invalidReason: `Channel not open (phase=${fields.phase.value})` };
  if (fields.facilitator.value !== config.facilitatorAddress) return { x402Version: 2, valid: false, invalidReason: 'Facilitator mismatch' };

  const remaining = fields.total_deposited.value - fields.total_spent.value;
  const reqs = Array.isArray(requirements) ? requirements : [requirements];

  for (const req of reqs) {
    const amount = parseInt(req.maxAmountRequired || req.price || req.amount);
    if (remaining >= amount) {
      if (req.asset && fields.token_uid.value !== req.asset) continue;
      return { x402Version: 2, valid: true, remaining };
    }
  }
  return { x402Version: 2, valid: false, invalidReason: `Insufficient channel balance (remaining: ${remaining})` };
}

async function settleChannel(channelId, amount, sellerAddress) {
  const stateResp = await getChannelState(channelId);
  if (!stateResp.success) return { x402Version: 2, success: false, error: 'Cannot query channel' };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'OPEN') return { x402Version: 2, success: false, error: 'Channel not open' };

  const tokenUid = fields.token_uid.value;
  const remaining = fields.total_deposited.value - fields.total_spent.value;
  if (remaining < amount) return { x402Version: 2, success: false, error: `Insufficient balance (${remaining} < ${amount})` };

  log('FACILITATOR', `Channel spend() — ${amount} of ${tokenUid} to ${sellerAddress}`);
  const result = await walletRequest('POST', '/wallet/nano-contracts/execute', {
    nc_id: channelId,
    method: 'spend',
    address: config.facilitatorAddress,
    data: {
      args: [amount, sellerAddress],
      actions: [{ type: 'withdrawal', token: tokenUid, amount, address: sellerAddress }],
    },
  }, config.facilitatorWalletId);

  if (!result.success) return { x402Version: 2, success: false, error: result.message || 'spend() failed' };
  return { x402Version: 2, success: true, txId: result.hash, network: `hathor:${config.network || 'privatenet'}` };
}

// ============================================================================
// HTTP Endpoints (scheme-agnostic)
// ============================================================================

app.post('/x402/verify', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  const scheme = paymentPayload.scheme;

  if (scheme === 'hathor-channel') {
    const { channelId } = paymentPayload.payload;
    log('FACILITATOR', `Channel verify for channelId=${channelId}`);
    const result = await verifyChannel(channelId, paymentRequirements);
    log('FACILITATOR', `Channel verify ${result.valid ? 'PASSED' : 'FAILED'}: ${result.invalidReason || 'OK'}`);
    return res.json(result);
  }

  // Default: escrow
  const { ncId } = paymentPayload.payload;
  log('FACILITATOR', `Escrow verify for ncId=${ncId}`);
  const result = await verifyEscrow(ncId, paymentRequirements);
  log('FACILITATOR', `Escrow verify ${result.valid ? 'PASSED' : 'FAILED'}: ${result.invalidReason || 'OK'}`);
  res.json(result);
});

app.post('/x402/settle', async (req, res) => {
  const { paymentPayload } = req.body;
  const scheme = paymentPayload.scheme;

  if (scheme === 'hathor-channel') {
    const { channelId } = paymentPayload.payload;
    const amount = req.body.amount || paymentPayload.payload.amount;
    const sellerAddress = req.body.sellerAddress || paymentPayload.payload.sellerAddress;
    // No idempotency cache for channels — same channelId is reused across requests
    log('FACILITATOR', `Channel settle for channelId=${channelId}, amount=${amount}`);
    const result = await settleChannel(channelId, amount, sellerAddress);
    log('FACILITATOR', `Channel settle ${result.success ? 'SUCCESS' : 'FAILED'}: ${result.txId || result.error}`);
    return res.json(result);
  }

  // Default: escrow
  const { ncId } = paymentPayload.payload;
  const cacheKey = `escrow:${ncId}`;

  // Idempotency: return cached result if already settled
  if (settlementCache.has(cacheKey)) {
    log('FACILITATOR', `Escrow settle CACHED for ncId=${ncId}`);
    return res.json(settlementCache.get(cacheKey));
  }

  log('FACILITATOR', `Escrow settle for ncId=${ncId}`);
  const result = await settleEscrow(ncId);
  log('FACILITATOR', `Escrow settle ${result.success ? 'SUCCESS' : 'FAILED'}: ${result.txId || result.error}`);
  if (result.success) settlementCache.set(cacheKey, result);
  res.json(result);
});

// ============================================================================
// Health check & wallet auto-recovery (#12)
// ============================================================================

async function checkWalletStatus(walletId) {
  try {
    const result = await walletRequest('GET', '/wallet/status', null, walletId);
    return result.statusCode === 3; // 3 = READY
  } catch {
    return false;
  }
}

async function restartWallet(walletId, seed) {
  try {
    log('FACILITATOR', `Restarting wallet: ${walletId}`);
    // Stop first (ignore errors if not started)
    await walletRequest('POST', '/wallet/stop', {}, walletId).catch(() => {});
    // Start with seed
    const result = await require('node-fetch')(`${config.walletHeadlessUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'wallet-id': walletId, seed }),
    }).then(r => r.json());
    log('FACILITATOR', `Wallet ${walletId} restart result: ${JSON.stringify(result)}`);
    return result.success !== false;
  } catch (err) {
    log('FACILITATOR', `Wallet ${walletId} restart failed: ${err.message}`);
    return false;
  }
}

async function ensureWalletsReady() {
  const facilitatorOk = await checkWalletStatus(config.facilitatorWalletId);
  const sellerOk = await checkWalletStatus(config.sellerWalletId);

  if (!facilitatorOk && process.env.FACILITATOR_SEED) {
    await restartWallet(config.facilitatorWalletId, process.env.FACILITATOR_SEED);
  }
  if (!sellerOk && process.env.SELLER_SEED) {
    await restartWallet(config.sellerWalletId, process.env.SELLER_SEED);
  }
}

// Periodic wallet health check (every 30 seconds)
setInterval(() => {
  ensureWalletsReady().catch(err => log('FACILITATOR', `Wallet check error: ${err.message}`));
}, 30000);

app.get('/health', async (req, res) => {
  const facilitatorOk = await checkWalletStatus(config.facilitatorWalletId);
  const sellerOk = await checkWalletStatus(config.sellerWalletId);
  const healthy = facilitatorOk && sellerOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    wallets: {
      facilitator: facilitatorOk ? 'ready' : 'disconnected',
      seller: sellerOk ? 'ready' : 'disconnected',
    },
    settlementCacheSize: settlementCache.size,
    uptime: process.uptime(),
  });
});

app.listen(config.facilitatorPort, () => {
  log('FACILITATOR', `x402 Facilitator running on port ${config.facilitatorPort}`);
  log('FACILITATOR', `Facilitator address: ${config.facilitatorAddress}`);
  log('FACILITATOR', `Escrow blueprint: ${config.blueprintId}`);
  log('FACILITATOR', `Channel blueprint: ${config.channelBlueprintId}`);
  // Initial wallet check on startup
  ensureWalletsReady().catch(err => log('FACILITATOR', `Initial wallet check error: ${err.message}`));
});
