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
  if (!stateResp.success) return { valid: false, invalidReason: `Cannot query contract: ${stateResp.message}` };

  const reqs = Array.isArray(requirements) ? requirements : [requirements];
  let lastErrors = [];
  for (const req of reqs) {
    const errors = validateEscrowAgainstRequirement(stateResp.fields, req);
    if (errors.length === 0) return { valid: true };
    lastErrors = errors;
  }
  return { valid: false, invalidReason: lastErrors.join('; ') };
}

async function settleEscrow(ncId) {
  const stateResp = await getNanoContractState(ncId);
  if (!stateResp.success) return { success: false, error: `Cannot query contract` };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'LOCKED') return { success: false, error: `Escrow not locked (phase=${fields.phase.value})` };

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

  if (!result.success) return { success: false, error: result.message || 'release() failed' };
  await waitForTxConfirmation(result.hash);
  return { success: true, txId: result.hash, network: 'hathor:privatenet' };
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
  if (!stateResp.success) return { valid: false, invalidReason: `Cannot query channel: ${stateResp.message}` };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'OPEN') return { valid: false, invalidReason: `Channel not open (phase=${fields.phase.value})` };
  if (fields.facilitator.value !== config.facilitatorAddress) return { valid: false, invalidReason: 'Facilitator mismatch' };

  const remaining = fields.total_deposited.value - fields.total_spent.value;
  const reqs = Array.isArray(requirements) ? requirements : [requirements];

  for (const req of reqs) {
    const amount = parseInt(req.maxAmountRequired || req.amount);
    if (remaining >= amount) {
      if (req.asset && fields.token_uid.value !== req.asset) continue;
      return { valid: true, remaining };
    }
  }
  return { valid: false, invalidReason: `Insufficient channel balance (remaining: ${remaining})` };
}

async function settleChannel(channelId, amount, sellerAddress) {
  const stateResp = await getChannelState(channelId);
  if (!stateResp.success) return { success: false, error: 'Cannot query channel' };

  const fields = stateResp.fields;
  if (fields.phase.value !== 'OPEN') return { success: false, error: 'Channel not open' };

  const tokenUid = fields.token_uid.value;
  const remaining = fields.total_deposited.value - fields.total_spent.value;
  if (remaining < amount) return { success: false, error: `Insufficient balance (${remaining} < ${amount})` };

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

  if (!result.success) return { success: false, error: result.message || 'spend() failed' };
  await waitForTxConfirmation(result.hash);
  return { success: true, txId: result.hash, network: 'hathor:privatenet' };
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
    log('FACILITATOR', `Channel settle for channelId=${channelId}, amount=${amount}`);
    const result = await settleChannel(channelId, amount, sellerAddress);
    log('FACILITATOR', `Channel settle ${result.success ? 'SUCCESS' : 'FAILED'}: ${result.txId || result.error}`);
    return res.json(result);
  }

  // Default: escrow
  const { ncId } = paymentPayload.payload;
  log('FACILITATOR', `Escrow settle for ncId=${ncId}`);
  const result = await settleEscrow(ncId);
  log('FACILITATOR', `Escrow settle ${result.success ? 'SUCCESS' : 'FAILED'}: ${result.txId || result.error}`);
  res.json(result);
});

app.listen(config.facilitatorPort, () => {
  log('FACILITATOR', `x402 Facilitator running on port ${config.facilitatorPort}`);
  log('FACILITATOR', `Facilitator address: ${config.facilitatorAddress}`);
  log('FACILITATOR', `Escrow blueprint: ${config.blueprintId}`);
  log('FACILITATOR', `Channel blueprint: ${config.channelBlueprintId}`);
});
