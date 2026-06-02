// Stateless server-issued challenge token. Encodes the route/amount/payTo/asset
// commitment and an expiry; HMAC-SHA256 binds it to this server's secret so the
// server can verify a returned challenge without keeping any per-challenge state.

'use strict';

const crypto = require('crypto');

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

function hmac(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest();
}

// Mint a fresh requestId. `claims` is the canonical 402 challenge: a server
// promise to itself that it offered this exact deal.
function mintRequestId({ route, amount, payTo, asset, network }, secret, ttlSeconds) {
  if (!secret) throw new Error('mintRequestId: missing server secret');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    route: String(route),
    amount: String(amount),
    payTo: String(payTo),
    asset: String(asset),
    network: String(network),
    exp: now + Number(ttlSeconds || 60),
    nonce: crypto.randomBytes(8).toString('base64url'),
  };
  const body = b64urlEncode(JSON.stringify(claims));
  const mac = b64urlEncode(hmac(secret, body));
  return `${body}.${mac}`;
}

// Verify the MAC, expiry, and that the claims match what the route expects.
// Returns { ok: true, claims } on success or { ok: false, reason } on failure.
function verifyAndDecodeRequestId(token, secret, expected = {}) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed_request_id' };
  const dot = token.indexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed_request_id' };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!body || !mac) return { ok: false, reason: 'malformed_request_id' };

  let recomputed;
  try {
    recomputed = b64urlEncode(hmac(secret, body));
  } catch (_) {
    return { ok: false, reason: 'bad_request_id_mac' };
  }
  if (recomputed.length !== mac.length ||
      !crypto.timingSafeEqual(Buffer.from(recomputed), Buffer.from(mac))) {
    return { ok: false, reason: 'bad_request_id_mac' };
  }

  let claims;
  try {
    claims = JSON.parse(b64urlDecode(body).toString('utf-8'));
  } catch (_) {
    return { ok: false, reason: 'malformed_request_id' };
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'request_id_expired' };
  }

  for (const k of ['route', 'amount', 'payTo', 'asset', 'network']) {
    if (expected[k] != null && String(expected[k]) !== String(claims[k])) {
      return { ok: false, reason: `requestId_${k}_mismatch` };
    }
  }

  return { ok: true, claims };
}

module.exports = { mintRequestId, verifyAndDecodeRequestId };
