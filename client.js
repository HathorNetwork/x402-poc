// x402 Client (Buyer / AI Agent)
// Demonstrates the full x402 payment flow:
// 1. Request resource -> get 402
// 2. Create escrow nano contract (deposit funds)
// 3. Retry request with payment proof
// 4. Receive resource

const fetch = require('node-fetch');
const config = require('./config');
const { walletRequest, waitForTxConfirmation, log } = require('./helpers');

async function main() {
  log('CLIENT', '=== x402 Payment Flow Demo ===');
  log('CLIENT', `Buyer address: ${config.buyerAddress}`);
  log('CLIENT', '');

  // Step 1: Request the paid resource (expect 402)
  log('CLIENT', 'Step 1: Requesting weather data...');
  const initialResp = await fetch(`http://localhost:${config.resourceServerPort}/weather`);
  const statusCode = initialResp.status;

  if (statusCode !== 402) {
    log('CLIENT', `Expected 402 but got ${statusCode}`);
    process.exit(1);
  }

  const paymentRequired = await initialResp.json();
  log('CLIENT', `Got 402 Payment Required`);

  const requirements = paymentRequired.accepts[0];
  log('CLIENT', `  Scheme: ${requirements.scheme}`);
  log('CLIENT', `  Amount: ${requirements.maxAmountRequired} cents (${parseInt(requirements.maxAmountRequired) / 100} HTR)`);
  log('CLIENT', `  Pay to: ${requirements.payTo}`);
  log('CLIENT', `  Facilitator: ${requirements.extra.facilitatorAddress}`);
  log('CLIENT', `  Blueprint: ${requirements.extra.blueprintId}`);
  log('CLIENT', '');

  // Step 2: Create escrow nano contract (deposit funds)
  log('CLIENT', 'Step 2: Creating escrow nano contract...');

  const deadline = Math.floor(Date.now() / 1000) + requirements.extra.deadlineSeconds;
  const amount = parseInt(requirements.maxAmountRequired);
  const resourceUrl = requirements.resource;

  const createResult = await walletRequest('POST', '/wallet/nano-contracts/create', {
    blueprint_id: requirements.extra.blueprintId,
    address: config.buyerAddress,
    data: {
      args: [
        requirements.payTo,                    // seller
        requirements.extra.facilitatorAddress,  // facilitator
        requirements.tokenUid,                 // token_uid
        deadline,                              // deadline
        resourceUrl,                           // resource_url
        'poc-request-hash',                    // request_hash
      ],
      actions: [{
        type: 'deposit',
        token: requirements.tokenUid,
        amount: amount,
      }],
    },
  }, config.buyerWalletId);

  if (!createResult.success) {
    log('CLIENT', `Failed to create escrow: ${JSON.stringify(createResult)}`);
    process.exit(1);
  }

  const ncId = createResult.hash;
  log('CLIENT', `Escrow created! ncId=${ncId}`);
  log('CLIENT', 'Waiting for tx confirmation...');

  await waitForTxConfirmation(ncId);
  log('CLIENT', 'Escrow tx confirmed on-chain');
  log('CLIENT', '');

  // Step 3: Retry request with payment proof
  log('CLIENT', 'Step 3: Retrying request with payment proof...');

  const paymentPayload = {
    scheme: 'hathor-escrow',
    network: 'hathor:privatenet',
    payload: {
      ncId: ncId,
      depositTxId: ncId,
      buyerAddress: config.buyerAddress,
    },
  };

  const paidResp = await fetch(`http://localhost:${config.resourceServerPort}/weather`, {
    headers: {
      'X-Payment': JSON.stringify(paymentPayload),
    },
  });

  if (paidResp.status !== 200) {
    const err = await paidResp.json();
    log('CLIENT', `Payment rejected: ${JSON.stringify(err)}`);
    process.exit(1);
  }

  const result = await paidResp.json();
  log('CLIENT', '');
  log('CLIENT', '=== Resource Received! ===');
  log('CLIENT', JSON.stringify(result.data, null, 2));
  log('CLIENT', '');
  log('CLIENT', `Payment ncId: ${result.payment.ncId}`);
  log('CLIENT', '');
  log('CLIENT', 'Waiting a few seconds for settlement to complete...');

  // Give the async settlement time to complete
  await new Promise(r => setTimeout(r, 15000));

  log('CLIENT', '');
  log('CLIENT', '=== x402 Payment Flow Complete ===');
}

main().catch(err => {
  log('CLIENT', `Error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
