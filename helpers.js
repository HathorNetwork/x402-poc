// Shared helpers for talking to wallet-headless and fullnode

const fetch = require('node-fetch');
const config = require('./config');

async function walletRequest(method, path, body, walletId) {
  const url = `${config.walletHeadlessUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (walletId) headers['X-Wallet-Id'] = walletId;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  return resp.json();
}

async function fullnodeRequest(path) {
  const url = `${config.fullnodeUrl}/v1a${path}`;
  const resp = await fetch(url);
  return resp.json();
}

async function getNanoContractState(ncId) {
  return fullnodeRequest(`/nano_contract/state?id=${ncId}&fields[]=buyer&fields[]=seller&fields[]=facilitator&fields[]=token_uid&fields[]=amount&fields[]=phase&fields[]=deadline&fields[]=resource_url&fields[]=request_hash&balances[]=00`);
}

async function waitForTxConfirmation(txId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fullnodeRequest(`/transaction?id=${txId}`);
    if (resp.success && resp.tx && resp.meta && resp.meta.first_block) {
      return resp;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Transaction ${txId} not confirmed after ${maxAttempts}s`);
}

function log(component, msg) {
  console.log(`[${component}] ${msg}`);
}

module.exports = {
  walletRequest,
  fullnodeRequest,
  getNanoContractState,
  waitForTxConfirmation,
  log,
};
