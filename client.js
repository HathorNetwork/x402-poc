// x402 buyer CLI — non-browser smoke test for the hathor-direct flow.
//
// Uses @hathor/wallet-lib directly (no wallet-headless dependency) because:
//   1. We need wallet.signMessageWithAddress(), which the headless HTTP API
//      doesn't expose today.
//   2. A single-process CLI is the simplest "agent making a paid request".
//
// Usage:
//   BUYER_SEED='abandon abandon ...' node client.js [--route weather|generate]
//   BUYER_SEED='...' node client.js --url http://localhost:3000/weather
//
// Requires the buyer wallet to be funded on the configured network (testnet
// faucet is sufficient).

'use strict';

const config = require('./config');
const { log } = require('./helpers');

const hathorLib = require('@hathor/wallet-lib');
const { HathorWallet, Network } = hathorLib;

// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const out = { route: 'weather', url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--route') out.route = argv[++i];
    else if (a.startsWith('--route=')) out.route = a.split('=')[1];
    else if (a === '--url') out.url = argv[++i];
    else if (a.startsWith('--url=')) out.url = a.split('=')[1];
  }
  return out;
}

const args = parseArgs(process.argv);
const url = args.url || `http://localhost:${config.resourceServerPort}/${args.route}`;

if (!process.env.BUYER_SEED) {
  log('CLIENT', 'BUYER_SEED is required. Export a 24-word seed.');
  process.exit(1);
}

// --- wallet bootstrap -------------------------------------------------------

async function startWallet() {
  log('CLIENT', `Starting wallet on ${config.network} (this can take a moment to sync)...`);

  const network = new Network(config.network);
  const wallet = new HathorWallet({
    seed: process.env.BUYER_SEED,
    server: `${config.fullnodeUrl}/v1a/`,
    network,
    pinCode: '000000',          // local-only POC PIN
    password: 'x402-poc',       // protects in-memory key material
  });

  await wallet.start({ pinCode: '000000', password: 'x402-poc' });

  // Wait until READY (state 3). The lib polls history; on a quiet wallet this
  // is sub-second, on a heavily used one it can take longer.
  const start = Date.now();
  while (true) {
    const ready = wallet.isReady?.() ?? (wallet.state === 3);
    if (ready) break;
    if (Date.now() - start > 120_000) throw new Error('wallet failed to reach READY in 120s');
    await new Promise((r) => setTimeout(r, 500));
  }

  log('CLIENT', 'Wallet READY.');
  return wallet;
}

// --- 402 + payment flow -----------------------------------------------------

async function fetch402() {
  const resp = await fetch(url);
  if (resp.status !== 402) {
    throw new Error(`expected 402, got ${resp.status}`);
  }
  const body = await resp.json();
  if (!body.accepts || !body.accepts.length) throw new Error('no accepts in 402 body');
  return body.accepts[0];
}

async function pay(wallet, accept) {
  const buyer = await wallet.getCurrentAddress({ markAsUsed: false });
  log('CLIENT', `Buyer address: ${buyer.address} (index ${buyer.index})`);

  log('CLIENT', `Paying ${(parseInt(accept.amount, 10) / 100).toFixed(2)} ${accept.asset === '00' ? 'HTR' : accept.asset} → ${accept.payTo}`);

  const sendTx = await wallet.sendManyOutputsSendTransaction(
    [
      {
        address: accept.payTo,
        value: parseInt(accept.amount, 10),
        token: accept.asset || '00',
      },
    ],
    {
      changeAddress: buyer.address,
      pinCode: '000000',
    }
  );
  const tx = await sendTx.run();
  const txId = tx?.hash || tx?.txId;
  if (!txId) throw new Error('no txId returned from sendTransaction');
  log('CLIENT', `Broadcast tx ${txId}`);

  log('CLIENT', `Signing requestId with address index ${buyer.index} ...`);
  const signature = await wallet.signMessageWithAddress(
    accept.extra.requestId,
    buyer.index,
    '000000'
  );

  return { txId, payerAddress: buyer.address, signature };
}

async function retry(accept, { txId, payerAddress, signature }) {
  const payload = {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: {
      txId,
      payerAddress,
      signature,
      requestId: accept.extra.requestId,
    },
  };
  const headerB64 = Buffer.from(JSON.stringify(payload)).toString('base64');

  log('CLIENT', 'Retrying GET with PAYMENT-SIGNATURE ...');
  const resp = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': headerB64 } });
  const body = await resp.json();
  if (!resp.ok) {
    throw new Error(`server rejected payment: ${JSON.stringify(body)}`);
  }
  return body;
}

// --- main -------------------------------------------------------------------

async function main() {
  log('CLIENT', `=== x402 hathor-direct demo — route=${args.route} ===`);
  log('CLIENT', `Target URL: ${url}`);

  const wallet = await startWallet();
  try {
    const accept = await fetch402();
    log('CLIENT', `402 received — scheme=${accept.scheme} amount=${accept.amount}`);

    const proof = await pay(wallet, accept);
    const result = await retry(accept, proof);

    log('CLIENT', '');
    log('CLIENT', '=== resource ===');
    log('CLIENT', JSON.stringify(result.data, null, 2));
    log('CLIENT', '');
    if (result.payment) {
      log('CLIENT', '=== payment ===');
      log('CLIENT', JSON.stringify(result.payment, null, 2));
    }
  } finally {
    try { await wallet.stop(); } catch (_) { /* ignore */ }
  }
}

main().catch((err) => {
  log('CLIENT', `ERROR: ${err.message}`);
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
