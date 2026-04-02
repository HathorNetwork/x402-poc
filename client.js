// x402 Client (Buyer / AI Agent)
// Demonstrates the full x402 payment flow:
// 1. Request resource -> get 402
// 2. Pick a payment option from the accepts array
// 3. Create escrow nano contract (deposit funds)
// 4. Retry request with payment proof
// 5. Receive resource
//
// Usage:
//   node client.js              # pay with first accepted token (HTR)
//   node client.js --token htr  # pay with HTR explicitly
//   node client.js --token custom # pay with the custom token (e.g. hUSDC)

const fetch = require('node-fetch');
const config = require('./config');
const { walletRequest, waitForTxConfirmation, log } = require('./helpers');

// Parse --token arg
const tokenArg = process.argv.find(a => a.startsWith('--token='))?.split('=')[1]
  || (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : null);

function pickPaymentOption(accepts) {
  if (tokenArg === 'custom' && config.customTokenUid) {
    const match = accepts.find(a => a.asset === config.customTokenUid);
    if (match) return match;
    log('CLIENT', `Custom token ${config.customTokenUid} not accepted, falling back`);
  }
  if (tokenArg === 'htr') {
    const match = accepts.find(a => a.asset === '00');
    if (match) return match;
  }
  // Default: pick first option
  return accepts[0];
}

async function main() {
  log('CLIENT', '=== x402 Payment Flow Demo ===');
  log('CLIENT', `Buyer address: ${config.buyerAddress}`);
  log('CLIENT', '');

  // Step 1: Request the paid resource (expect 402)
  log('CLIENT', 'Step 1: Requesting weather data...');
  const initialResp = await fetch(`http://localhost:${config.resourceServerPort}/weather`);

  if (initialResp.status !== 402) {
    log('CLIENT', `Expected 402 but got ${initialResp.status}`);
    process.exit(1);
  }

  const paymentRequired = await initialResp.json();
  log('CLIENT', `Got 402 Payment Required`);
  log('CLIENT', `  ${paymentRequired.accepts.length} payment option(s) available:`);
  for (const opt of paymentRequired.accepts) {
    log('CLIENT', `    - ${opt.description} (asset: ${opt.asset}, amount: ${opt.amount})`);
  }
  log('CLIENT', '');

  // Step 2: Pick a payment option
  const chosen = pickPaymentOption(paymentRequired.accepts);
  log('CLIENT', `Step 2: Chose payment option: ${chosen.description}`);
  log('CLIENT', `  Asset: ${chosen.asset}`);
  log('CLIENT', `  Amount: ${chosen.amount}`);
  log('CLIENT', `  Pay to: ${chosen.payTo}`);
  log('CLIENT', `  Facilitator: ${chosen.extra.facilitatorAddress}`);
  log('CLIENT', '');

  // Step 3: Create escrow nano contract (deposit funds)
  log('CLIENT', 'Step 3: Creating escrow nano contract...');

  const deadline = Math.floor(Date.now() / 1000) + chosen.extra.deadlineSeconds;
  const amount = parseInt(chosen.amount);

  const createResult = await walletRequest('POST', '/wallet/nano-contracts/create', {
    blueprint_id: chosen.extra.blueprintId,
    address: config.buyerAddress,
    data: {
      args: [
        chosen.payTo,                        // seller
        chosen.extra.facilitatorAddress,      // facilitator
        chosen.asset,                        // token_uid
        deadline,                            // deadline
        chosen.resource,                     // resource_url
        'poc-request-hash',                  // request_hash
      ],
      actions: [{
        type: 'deposit',
        token: chosen.asset,
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

  // Step 4: Retry request with payment proof
  log('CLIENT', 'Step 4: Retrying request with payment proof...');

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
