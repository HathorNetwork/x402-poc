// Small utilities shared across the backend: structured logging, fullnode
// reads, tx introspection, and bitcore-style message-signature verification.

'use strict';

const config = require('./config');

function log(component, msg) {
  // eslint-disable-next-line no-console
  console.log(`[${component}] ${msg}`);
}

// --- Fullnode HTTP -----------------------------------------------------------

async function fullnodeRequest(path) {
  const url = `${config.fullnodeUrl}/v1a${path}`;
  const resp = await fetch(url);
  return resp.json();
}

// GET /v1a/transaction?id=<hash>
// Returns { success, tx?, meta? } where meta has voided_by / conflict_with / first_block.
async function getTransaction(txId) {
  return fullnodeRequest(`/transaction?id=${encodeURIComponent(txId)}`);
}

// Poll until the tx is visible at our fullnode. We don't wait for first_block —
// the verifier is the one that decides whether zero-conf is OK for the amount.
async function waitForTxInMempool(txId, { maxAttempts = 30, intervalMs = 1000 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await getTransaction(txId);
      if (resp.success && resp.tx) return resp;
    } catch (_) { /* swallow and retry */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`tx ${txId} not visible at fullnode after ${maxAttempts} polls`);
}

// --- Transaction introspection ----------------------------------------------

// Resolve an output's token UID by looking at token_data + the tx.tokens list.
// HTR is '00' (token_data 0). Custom tokens use the low 7 bits of token_data as
// an index into tx.tokens (1-based). The high bit marks authorities.
function resolveTokenUid(output, tx) {
  const td = output.token_data || 0;
  const tokenIndex = td & 0x7f;
  if (tokenIndex === 0) return '00';
  const entry = (tx.tokens || [])[tokenIndex - 1];
  return entry ? entry.uid : null;
}

// Find the FIRST output that pays `payTo` at least `minValue` of `asset`.
// Returns { outputIndex, value, token } or null.
function findPayingOutput(tx, { payTo, asset, minValue }) {
  const min = BigInt(minValue);
  const outputs = tx.outputs || [];
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i];
    const decoded = out.decoded || {};
    if (decoded.address !== payTo) continue;
    const token = resolveTokenUid(out, tx);
    if (token !== asset) continue;
    const value = BigInt(out.value);
    if (value < min) continue;
    return { outputIndex: i, value: out.value, token };
  }
  return null;
}

function getInputAddresses(tx) {
  return new Set((tx.inputs || []).map((i) => i.decoded && i.decoded.address).filter(Boolean));
}

function getOutputAddresses(tx) {
  return new Set((tx.outputs || []).map((o) => o.decoded && o.decoded.address).filter(Boolean));
}

// --- Message-signature verification (Bitcoin-compatible / Hathor) -----------
// We go through @hathor/wallet-lib's verifyMessage so the address-version-byte
// handling is aligned with how the wallet stack signs. The lib lazily
// initialises network state; we pass the configured network.
let _walletLib = null;
function lazyWalletLib() {
  if (_walletLib) return _walletLib;
  _walletLib = require('@hathor/wallet-lib');
  // Set the global network so bitcore's address parsing knows which version
  // byte to expect. The lib exports a Network class and a default config.
  try {
    const net = new _walletLib.Network(config.network);
    if (_walletLib.config && typeof _walletLib.config.setNetwork === 'function') {
      _walletLib.config.setNetwork(net);
    }
  } catch (_) { /* lib version variance — verifyMessage still works */ }
  return _walletLib;
}

function verifyMessageSignature(message, signatureBase64, address) {
  const lib = lazyWalletLib();
  // wallet-lib v2 exposes the crypto helpers under `cryptoUtils.*`; older
  // versions used `utils.crypto.*`. Support either.
  const verify =
    (lib.cryptoUtils && lib.cryptoUtils.verifyMessage) ||
    (lib.utils && lib.utils.crypto && lib.utils.crypto.verifyMessage) ||
    (lib.verifyMessage && lib.verifyMessage.bind(lib));
  if (typeof verify !== 'function') {
    throw new Error('verifyMessage not available in @hathor/wallet-lib');
  }
  try {
    return Boolean(verify(message, signatureBase64, address));
  } catch (_) {
    return false;
  }
}

module.exports = {
  log,
  fullnodeRequest,
  getTransaction,
  waitForTxInMempool,
  resolveTokenUid,
  findPayingOutput,
  getInputAddresses,
  getOutputAddresses,
  verifyMessageSignature,
};
