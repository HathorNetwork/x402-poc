// x402 Facilitator Server
// Exposes /x402/verify and /x402/settle endpoints
// Talks to hathor-forge fullnode for state queries and wallet-headless for settlement

const express = require('express');
const config = require('./config');
const { walletRequest, getNanoContractState, waitForTxConfirmation, log } = require('./helpers');

const app = express();
app.use(express.json());

// POST /x402/verify
// Resource server calls this to verify an escrow is valid
app.post('/x402/verify', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  const { ncId } = paymentPayload.payload;

  log('FACILITATOR', `Verify request for ncId=${ncId}`);

  const stateResp = await getNanoContractState(ncId);
  if (!stateResp.success) {
    return res.json({ valid: false, invalidReason: `Cannot query contract: ${stateResp.message}` });
  }

  const fields = stateResp.fields;
  const errors = [];

  if (fields.phase.value !== 'LOCKED') {
    errors.push(`phase is ${fields.phase.value}, expected LOCKED`);
  }
  if (fields.amount.value < parseInt(paymentRequirements.maxAmountRequired)) {
    errors.push(`amount ${fields.amount.value} < required ${paymentRequirements.maxAmountRequired}`);
  }
  if (fields.seller.value !== paymentRequirements.payTo) {
    errors.push(`seller ${fields.seller.value} != payTo ${paymentRequirements.payTo}`);
  }
  if (fields.facilitator.value !== config.facilitatorAddress) {
    errors.push(`facilitator ${fields.facilitator.value} != expected ${config.facilitatorAddress}`);
  }

  if (errors.length > 0) {
    log('FACILITATOR', `Verification FAILED: ${errors.join('; ')}`);
    return res.json({ valid: false, invalidReason: errors.join('; ') });
  }

  log('FACILITATOR', `Verification PASSED for ncId=${ncId}`);
  res.json({ valid: true });
});

// POST /x402/settle
// Resource server calls this after serving the resource
app.post('/x402/settle', async (req, res) => {
  const { ncId } = req.body.paymentPayload.payload;

  log('FACILITATOR', `Settle request for ncId=${ncId}`);

  // Get escrow state to know amount and seller
  const stateResp = await getNanoContractState(ncId);
  if (!stateResp.success) {
    return res.json({ success: false, error: `Cannot query contract: ${stateResp.message}` });
  }

  const fields = stateResp.fields;
  if (fields.phase.value !== 'LOCKED') {
    return res.json({ success: false, error: `Escrow not locked (phase=${fields.phase.value})` });
  }

  const amount = fields.amount.value;
  const seller = fields.seller.value;
  const tokenUid = fields.token_uid.value;

  // Execute release() on the nano contract via wallet-headless
  log('FACILITATOR', `Calling release() — withdrawing ${amount} to seller ${seller}`);
  const result = await walletRequest('POST', '/wallet/nano-contracts/execute', {
    nc_id: ncId,
    method: 'release',
    address: config.facilitatorAddress,
    data: {
      args: [],
      actions: [{
        type: 'withdrawal',
        token: tokenUid,
        amount: amount,
        address: seller,
      }],
    },
  }, config.facilitatorWalletId);

  if (!result.success) {
    log('FACILITATOR', `Settlement FAILED: ${JSON.stringify(result)}`);
    return res.json({ success: false, error: result.message || 'release() failed' });
  }

  log('FACILITATOR', `Settlement SUCCESS — txId=${result.hash}`);

  // Wait for the release tx to confirm
  await waitForTxConfirmation(result.hash);
  log('FACILITATOR', `Release tx confirmed: ${result.hash}`);

  res.json({
    success: true,
    txId: result.hash,
    network: 'hathor:privatenet',
  });
});

app.listen(config.facilitatorPort, () => {
  log('FACILITATOR', `x402 Facilitator running on port ${config.facilitatorPort}`);
  log('FACILITATOR', `Facilitator address: ${config.facilitatorAddress}`);
  log('FACILITATOR', `Blueprint ID: ${config.blueprintId}`);
});
