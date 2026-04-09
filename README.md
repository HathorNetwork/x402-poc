# x402 Payment Protocol POC for Hathor Network

> Machines paying machines. HTTP 402 meets nano contract escrow.

This is a proof-of-concept implementation of the [x402 protocol](https://www.x402.org/) on [Hathor Network](https://hathor.network/). It enables pay-per-request HTTP APIs settled natively on Hathor's DAG-based L1 blockchain using **nano contract escrow**.

## What is x402?

[x402](https://www.x402.org/) is an open protocol that repurposes the HTTP `402 Payment Required` status code for machine-to-machine payments. When a client requests a paid resource, the server returns a `402` with payment instructions. The client pays, retries the request with proof of payment, and gets the resource. No API keys, no billing accounts, no human interaction.

The client is always code — an AI agent, a script, a backend service. Never a human clicking buttons.

## How Hathor does it: one escrow per request

On EVM chains (Base, Polygon), x402 payments use signed messages — the client signs an authorization off-chain, and the facilitator submits it on-chain in one step. Simple, but it relies on nonces and trust.

**Hathor takes a different approach: on-chain escrow.**

Every x402 payment creates a **new nano contract instance** from the [X402Escrow blueprint](blueprint/x402_escrow.py). Here's what that means concretely:

1. The `X402Escrow` blueprint is published on-chain once (like a class definition)
2. Each payment **instantiates** a new contract from that blueprint (like creating an object)
3. The client deposits funds into this new contract — they're locked on-chain
4. The facilitator verifies the lock, the server delivers the resource
5. The facilitator calls `release()` on the contract — funds go to the seller

So if an AI agent makes 10 API calls, there are **10 separate escrow contracts** on the Hathor DAG. Each one:

- Has its own contract ID (`ncId`) which doubles as the payment receipt
- Holds its own funds, independently locked
- Has its own deadline (auto-refund if the facilitator disappears)
- Can be verified by anyone — just query the contract state on any full node
- Cannot be double-spent — the funds are locked in the contract, not in a UTXO

```
 Blueprint (published once)          Instances (one per payment)
┌──────────────────────────┐
│     X402Escrow           │        ┌─────────────┐
│                          │───────▶│ Payment #1  │  LOCKED → RELEASED
│  initialize()            │        │ 1.00 HTR    │
│  release()               │        └─────────────┘
│  refund()                │        ┌─────────────┐
│                          │───────▶│ Payment #2  │  LOCKED → RELEASED
│                          │        │ 1.00 HTR    │
└──────────────────────────┘        └─────────────┘
                                    ┌─────────────┐
                               ────▶│ Payment #3  │  LOCKED → REFUNDED
                                    │ 5.00 hUSDC  │  (buyer cancelled)
                                    └─────────────┘
```

### Why not pre-signed transactions?

The naive approach for UTXO chains is pre-signed transactions: the client signs a tx offline and hands it to the facilitator. But the client can **double-spend those UTXOs** before the facilitator broadcasts. On EVM this is solved by nonces; Hathor doesn't have nonces. Nano contract escrow solves it completely — funds are locked on-chain the moment the client deposits.

|                    | Pre-Signed TX                           | Nano Contract Escrow                        |
| ------------------ | --------------------------------------- | ------------------------------------------- |
| Double-spend risk  | **High** — client can spend UTXOs       | **Zero** — funds locked on-chain            |
| Verification       | Off-chain signature check               | **On-chain state query** — trustless        |
| Refund on timeout  | Impossible without timelock hacks       | **Built-in** — contract refunds             |
| Trust model        | Must trust facilitator won't hold tx    | **Trustless** — contract enforces rules     |

## The escrow lifecycle

Each escrow contract goes through exactly one of two paths:

```
                    ┌─────────────────────────────┐
                    │          LOCKED              │
  initialize()      │                             │
  + deposit ───────▶│  Funds held in contract.    │
                    │  Buyer, seller, facilitator, │
                    │  amount, deadline recorded.  │
                    │                             │
                    └──────────┬──────────┬───────┘
                               │          │
                  release()    │          │  refund()
                  by facilitator│         │  by buyer (anytime)
                  after server  │         │  by facilitator (anytime)
                  delivers      │         │  by anyone (after deadline)
                  resource      │         │
                               ▼          ▼
                    ┌──────────────┐  ┌──────────────┐
                    │   RELEASED   │  │   REFUNDED   │
                    │              │  │              │
                    │ Funds sent   │  │ Funds sent   │
                    │ to seller    │  │ back to buyer│
                    └──────────────┘  └──────────────┘
```

**Three roles, clear permissions:**
- **Buyer**: deposits funds (initialize), can cancel anytime (refund)
- **Facilitator**: releases funds to seller after verification, can refund if service failed
- **Anyone**: can trigger refund after the deadline — dead man's switch so funds are never locked forever

## Full payment flow

```
  CLIENT (AI agent)            RESOURCE SERVER              FACILITATOR              HATHOR
  ─────────────────            ───────────────              ───────────              ──────
        │                            │                           │                     │
   1.   │── GET /weather ──────────▶ │                           │                     │
        │                            │                           │                     │
   2.   │◀── 402 Payment Required ── │                           │                     │
        │    {amount: "100",         │                           │                     │
        │     asset: "00",           │                           │                     │
        │     payTo, facilitator,    │                           │                     │
        │     blueprintId}           │                           │                     │
        │                            │                           │                     │
   3.   │── create new X402Escrow ─────────────────────────────────────────────────▶   │
        │   contract instance        │                           │                     │
        │   (initialize + deposit    │                           │              LOCKED  │
        │    1.00 HTR)               │                           │                     │
        │◀── ncId (= tx hash) ──────────────────────────────────────────────────────── │
        │                            │                           │                     │
   4.   │── GET /weather ──────────▶ │                           │                     │
        │   + X-Payment {ncId}       │                           │                     │
        │                            │── POST /x402/verify ────▶ │                     │
        │                            │   {ncId, amount, payTo}   │── query nc state ─▶ │
        │                            │                           │◀─ {LOCKED, 100} ──  │
        │                            │◀── {valid: true} ──────── │                     │
        │                            │                           │                     │
   5.   │◀── 200 + weather data ──── │                           │                     │
        │                            │                           │                     │
   6.   │                            │── POST /x402/settle ────▶ │                     │
        │                            │   {ncId}                  │── release() ───────▶│
        │                            │                           │  (withdraw to seller)│
        │                            │                           │◀── txId ─────────── │
        │                            │◀── {success, txId} ────── │             RELEASED │
        │                            │                           │                     │
```

**Timing:** ~10s for escrow deposit confirmation, ~100ms for verification, instant HTTP response, ~10s for settlement confirmation. The client waits ~10s before getting the resource; settlement happens async after the resource is served.

## This POC includes

### Backend (Node.js)

| Component | File | Port | What it does |
|-----------|------|------|-------------|
| **Facilitator** | `facilitator.js` | 8402 | Verifies escrow state (`/x402/verify`) and triggers settlement (`/x402/settle`) |
| **Resource Server** | `resource-server.js` | 3000 | Example paid weather API with x402 middleware. Accepts HTR and custom tokens |
| **Client** | `client.js` | — | Programmatic x402 client. Fetches → gets 402 → creates escrow → retries → gets data |
| **Blueprint** | `blueprint/x402_escrow.py` | — | The X402Escrow nano contract source (Python 3.11) |

### Frontend (Next.js dApp)

The `dapp/` directory contains a browser-based x402 payment client built with [create-hathor-dapp](https://github.com/HathorNetwork/create-hathor-dapp):

1. Connect your Hathor wallet (WalletConnect / Reown)
2. Enter any x402-enabled URL
3. See the 402 payment requirements (amount, token options, seller)
4. Click "Pay & Access" — your wallet signs the escrow deposit
5. Wait for on-chain confirmation (~10s)
6. Resource data displayed

The dApp replaces `client.js` for interactive use — instead of the agent calling wallet-headless programmatically, the user approves the escrow deposit through their wallet app.

## Multi-token support

The resource server can accept multiple tokens per route. The 402 response lists all options in the `accepts` array:

```json
{
  "accepts": [
    { "asset": "00", "amount": "100", "description": "Pay 1.00 HTR" },
    { "asset": "000003e3...", "amount": "1000", "description": "Or pay 10.00 hUSDC" }
  ]
}
```

The client picks whichever token it holds. The escrow blueprint is token-agnostic — it works with any Hathor token.

## Quick Start

### Prerequisites

- Node.js 18+
- [Hathor Forge](https://github.com/HathorNetwork/hathor-forge) (local blockchain)

### 1. Start Hathor Forge

```bash
hathor-forge-cli --start
```

### 2. Create and fund wallets

```bash
hathor-forge create-wallet buyer
hathor-forge create-wallet facilitator
hathor-forge create-wallet seller
hathor-forge fund-wallet buyer --amount 100
hathor-forge fund-wallet facilitator --amount 10
```

### 3. Publish the blueprint

```bash
hathor-forge publish-blueprint facilitator --code blueprint/x402_escrow.py
# Note the returned blueprint_id
```

### 4. Configure and run

```bash
cp .env.example .env
# Edit .env with your wallet addresses and blueprint_id

npm install

# Terminal 1: Facilitator
node facilitator.js

# Terminal 2: Resource server
node resource-server.js

# Terminal 3: Client
node client.js
```

### 5. Or use the dApp

```bash
cd dapp
npm install
npm run dev
# Open http://localhost:3000, connect wallet, fetch a paid URL
```

## Project Structure

```
x402-poc/
├── blueprint/
│   └── x402_escrow.py        # Escrow nano contract (Python 3.11)
├── facilitator.js             # Verify + settle service (:8402)
├── resource-server.js         # Example paid API (:3000)
├── client.js                  # Programmatic x402 client
├── config.js                  # Shared config (env vars)
├── helpers.js                 # HTTP helpers
├── dapp/                      # Browser-based x402 client (Next.js)
│   ├── app/                   # Pages (dashboard, escrow detail)
│   ├── components/            # X402Fetch, EscrowList, EscrowDetail
│   ├── contexts/              # Wallet, Hathor, WalletConnect providers
│   └── lib/                   # Config, API, escrow store
├── Dockerfile
├── .env.example
└── package.json
```

## What's next

This is a POC. A production implementation would add:

- **`@hathor/x402-client`** — npm package wrapping `fetch()` to handle 402 automatically ([RFC](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0002-x402-client-sdk.md))
- **`@hathor/x402-server`** — Express middleware to add x402 to any API in 3 lines ([RFC](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0003-x402-server-middleware.md))
- **Facilitator as headless plugin** — runs inside `hathor-wallet-headless`, not as a separate server
- **Hosted public facilitator** — so sellers don't need to run their own
- **Mempool-aware verification** — verify escrow before block confirmation (~1s instead of ~10s)
- **Payment channels** — pre-funded escrows for repeat clients (eliminates per-request latency)

## References

- [x402 Protocol Specification](https://www.x402.org/)
- [RFC: x402 Support for Hathor Network](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0001-x402-support.md)
- [RFC: x402 Client SDK](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0002-x402-client-sdk.md)
- [RFC: x402 Server Middleware](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0003-x402-server-middleware.md)
- [Hathor Nano Contracts](https://hathor.network/resources/nano-contracts/)
- [Hathor Forge](https://github.com/HathorNetwork/hathor-forge) — Local development environment
- [create-hathor-dapp](https://github.com/HathorNetwork/create-hathor-dapp) — dApp scaffolding template

## License

MIT
