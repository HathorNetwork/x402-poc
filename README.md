# x402 Payment Protocol PoC for Hathor Network

> Machines paying machines, settled on Hathor with regular UTXO payments.
> No nano contracts, no escrow blueprint, no facilitator hot wallet.

This is a proof-of-concept implementation of the [x402 protocol](https://www.x402.org/)
on [Hathor Network](https://hathor.network/) using the **`hathor-direct`** scheme: the
client makes an ordinary "send tokens" transaction to the seller, signs a server-issued
challenge with its payer key, and the server verifies the on-chain payment + signature
read-only.

See the full design rationale (with the rejected nano-contract design and the
fair-exchange / trust analysis) in
[`../x402-hathor-no-nc-proposal.md`](../x402-hathor-no-nc-proposal.md).

## What is x402?

[x402](https://www.x402.org/) repurposes the HTTP `402 Payment Required` status code
for machine-to-machine payments: a client requests a paid resource, the server returns
a 402 with payment requirements, the client pays, retries the request with proof, and
gets the resource. The client is always code — an AI agent, a script, a backend
service. Never a human clicking buttons.

## How Hathor does it (this PoC)

```
┌──────────────┐          ┌──────────────────────────┐          ┌─────────────────┐
│   dApp /     │──fetch──▶│   resource-server        │──read───▶│ Hathor fullnode │
│   agent      │          │   verifier.js +          │          │ (testnet/etc.)  │
│              │          │   dedupStore +           │          └─────────────────┘
│ htr_sendTx   │          │   voidWatcher +          │                  ▲
│ htr_signWith │          │   (refundIssuer for      │                  │
│  Address     │          │    the upto scheme)      │                  │
└──────┬───────┘          └──────────┬───────────────┘                  │
       │                             │ POST /wallet/send-tx (refund only)
       ▼                             ▼
   Hathor wallet               wallet-headless (seller refund wallet)
   (desktop / mobile /
    MetaMask snap)
```

Two on-chain transactions in the worst case:

1. **Client → seller**: a plain `sendTransaction` paying `amount` to `payTo`.
   This is the *only* tx for `hathor-direct` (exact).
2. **Seller → client** (upto only): a refund tx for `amount - chargedAmount`,
   issued by the seller's wallet-headless after the route handler reports
   actual usage.

The server (or an optional facilitator wrapper) is purely read-only against the
fullnode:

- Verify the on-chain payment (correct `payTo`, `amount`, asset, not voided).
- Verify the payer signature over the server-issued `requestId`.
- Atomically dedup against the SQLite ledger so the same payment can't be replayed.
- Kick off a void-watcher for zero-conf payments; double-spending payers get
  blocklisted.

## Schemes

| Scheme | Semantics | Settlement |
|---|---|---|
| `hathor-direct` | Pay exact amount up front. | No-op — payment is final on-chain. |
| `hathor-direct-upto` | Authorize a max. Server charges actual usage. | Server issues a refund tx for `max - charged` from its own wallet. |

Both use the same wire protocol and verifier code path; `upto` adds the optional
refund step.

## Wire protocol

402 body returned by the resource server:

```jsonc
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "hathor-direct" | "hathor-direct-upto",
    "network": "hathor:testnet",
    "amount": "100",          // atomic units; 1 HTR = 100. For upto, this is MAX.
    "asset": "00",            // "00" = HTR
    "payTo": "WXf4x…",
    "resource": "https://host/route",
    "maxTimeoutSeconds": 120,
    "description": "Pay 1.00 HTR",
    "extra": {
      "requestId": "<base64url(claims)>.<base64url(mac)>",
      "facilitatorUrl": "https://…"   // optional
    }
  }]
}
```

The client retries with a `PAYMENT-SIGNATURE` header (base64-encoded JSON):

```jsonc
{
  "x402Version": 2,
  "scheme": "hathor-direct",
  "network": "hathor:testnet",
  "payload": {
    "txId": "000abc…",
    "payerAddress": "WPo2…",
    "signature": "BASE64…",
    "requestId": "<base64url(claims)>.<base64url(mac)>"
  }
}
```

## Components

| Component | File | Port | What it does |
|---|---|---|---|
| **Resource server** | `resource-server.js` | 3000 | Paid `/weather` (direct) + `/generate` (upto). Self-verifies via `verifier.js`. |
| **Facilitator** (optional) | `facilitator.js` | 8402 | Thin HTTP wrapper around the verifier. No wallet, no seeds, no nano contracts. |
| **Verifier** | `verifier.js` | — | Single source of truth for "is this payment claim valid?" |
| **Dedup store** | `dedupStore.js` + SQLite | — | Atomic `(txId, outputIndex)` ledger + payer blocklist. |
| **requestId** | `requestId.js` | — | Stateless HMAC challenge token (binds payment ↔ request). |
| **Void watcher** | `voidWatcher.js` | — | Background detection of double-spent payments → blocklist. |
| **Refund issuer** | `refundIssuer.js` | — | Calls the seller's wallet-headless to issue upto refunds. |
| **CLI client** | `client.js` | — | Buyer-side smoke test using `@hathor/wallet-lib`. |
| **dApp** | `dapp/` | 3000 | Browser client (Next.js + WalletConnect/Reown + MetaMask Snap). |
| **MCP example** | `examples/mcp-server/` | stdio | Paid MCP tool gated by `hathor-direct`. |

## Quick start

```bash
# 0. Fund a Hathor address on testnet (faucet) — that's the seller address.
#    Generate a seed for the seller wallet (only needed for the upto scheme).

cp .env.example .env
$EDITOR .env       # set SELLER_ADDRESS, SELLER_SEED, SERVER_SECRET

docker compose up --build
#   -> wallet-headless on :8000 (seller wallet)
#   -> resource-server on :3000 (paid /weather, /generate)
#   -> dapp on :4020

# Browser: http://localhost:4020 — connect WalletConnect, fetch the paid URL.
# CLI:     BUYER_SEED='...' node client.js --route weather
```

## What this PoC is NOT

- **Not production-ready.** Idempotent retry response caching, blocklist
  sharing, structured logging, metrics, key rotation for `SERVER_SECRET`
  are all deferred.
- **Not confidential-transaction-enabled.** Hathor's shielded outputs are
  alpha and out of mainnet — the design is *compatible* with future CT but
  this PoC doesn't exercise it.
- **No protocol-level refund** beyond the upto remainder. If the server takes
  the payment and doesn't deliver, there is no on-chain recovery — same trust
  model as EVM `exact`. Reputation + small amounts + amount caps is the
  bounding mechanism.

## References

- Design proposal: [`../x402-hathor-no-nc-proposal.md`](../x402-hathor-no-nc-proposal.md)
- x402 specification: <https://www.x402.org/>
- x402 v1 → v2 migration: <https://docs.x402.org/guides/migration-v1-to-v2>
- Hathor wallet-lib `signMessage`/`verifyMessage`:
  `hathor-wallet-lib/src/utils/crypto.ts`
- Hathor RPC methods (`htr_sendTransaction`, `htr_signWithAddress`):
  `hathor-rpc-lib/packages/hathor-rpc-handler/src/types/rpcRequest.ts`

## License

MIT
