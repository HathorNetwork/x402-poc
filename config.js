// x402 PoC Configuration (hathor-direct scheme — no nano contracts).
// All knobs are overrideable via environment variables.

'use strict';

const env = process.env;

const int = (v, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
};

module.exports = {
  // Hathor fullnode (read-only) — used by the verifier and the dApp.
  fullnodeUrl: env.FULLNODE_URL || 'https://node1.testnet.hathor.network',
  network: env.HATHOR_NETWORK || 'testnet',
  htrTokenUid: '00',

  // Resource server
  resourceServerPort: int(env.RESOURCE_SERVER_PORT, 3000),
  resourceServerPublicUrl: env.RESOURCE_SERVER_PUBLIC_URL || 'http://localhost:3000',

  // Standalone facilitator (optional in compose — only used when VERIFY_MODE=facilitator)
  facilitatorPort: int(env.FACILITATOR_PORT, 8402),
  facilitatorUrl: env.FACILITATOR_URL || `http://localhost:${int(env.FACILITATOR_PORT, 8402)}`,

  // The seller's receiving address. Static config — the resource server never
  // touches a wallet for the exact scheme. For the upto scheme, a seller-side
  // wallet-headless issues the refund tx (see refundIssuer.js).
  sellerAddress: env.SELLER_ADDRESS || '',

  // Seller wallet-headless (only used by the upto scheme to issue refunds).
  sellerWalletUrl: env.SELLER_WALLET_URL || 'http://wallet-headless:8000',
  sellerWalletId: env.SELLER_WALLET_ID || 'seller',

  // Server secret used to HMAC requestIds. If unset we fall back to a fixed
  // string so mint+verify use the same key (otherwise empty=='' on verify
  // wouldn't match the fallback used at mint, causing silent bad_request_id_mac
  // failures). Set SERVER_SECRET in prod — startup logs a clear warning otherwise.
  serverSecret: env.SERVER_SECRET || 'x402-poc-dev-secret-do-not-use-in-prod',
  requestIdTtlSeconds: int(env.REQUEST_ID_TTL_SECONDS, 120),

  // Dedup + blocklist store (better-sqlite3 file).
  dedupDbPath: env.DEDUP_DB_PATH || './data/payments.sqlite',

  // Zero-conf safety threshold: amounts above this require meta.first_block.
  // Default is "no cap" so all amounts use zero-conf; set lower in prod.
  zeroConfMaxAmount: int(env.ZERO_CONF_MAX_AMOUNT, Number.MAX_SAFE_INTEGER),

  // Verify path: 'self' (resource-server imports verifier directly) or
  // 'facilitator' (resource-server calls /x402/verify over HTTP).
  verifyMode: env.VERIFY_MODE === 'facilitator' ? 'facilitator' : 'self',

  // Default per-route prices (atomic units; 1 HTR = 100).
  htrPaymentAmount: int(env.HTR_PAYMENT_AMOUNT, 100),
  generateMaxPrice: int(env.GENERATE_MAX_PRICE, 500),

  // Custom token used by the /api/* playground routes (e.g. hUSDC on testnet).
  // Defaults to HTR so the routes still work without the env set.
  paymentTokenUid: env.PAYMENT_TOKEN_UID || '00',
  paymentTokenSymbol: env.PAYMENT_TOKEN_SYMBOL || 'HTR',
};
