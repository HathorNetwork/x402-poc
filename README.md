# x402 Payment Protocol POC for Hathor Network

> Machines paying machines. HTTP 402 meets nano contract escrow.

This is a proof-of-concept implementation of the [x402 protocol](https://www.x402.org/) on [Hathor Network](https://hathor.network/). It enables pay-per-request HTTP APIs settled natively on Hathor's DAG-based L1 blockchain using **nano contract escrow** — no pre-signed transactions, no double-spend risk, no trust required.

## How It Works

```
                           x402 Payment Flow
                           
  CLIENT (AI agent)            RESOURCE SERVER              FACILITATOR              HATHOR
  ─────────────────            ───────────────              ───────────              ──────
        │                            │                           │                     │
   1.   │── GET /weather ──────────▶ │                           │                     │
        │                            │                           │                     │
   2.   │◀── 402 Payment Required ── │                           │                     │
        │    {scheme, amount,        │                           │                     │
        │     seller, facilitator,   │                           │                     │
        │     blueprintId}           │                           │                     │
        │                            │                           │                     │
   3.   │── create escrow ──────────────────────────────────────────────────────────▶  │
        │   (deposit 1 HTR)          │                           │              LOCKED  │
        │◀── ncId ──────────────────────────────────────────────────────────────────── │
        │                            │                           │                     │
   4.   │── GET /weather ──────────▶ │                           │                     │
        │   + X-Payment {ncId}       │                           │                     │
        │                            │── POST /x402/verify ────▶ │                     │
        │                            │                           │── query state ─────▶│
        │                            │                           │◀── {LOCKED, 100} ── │
        │                            │◀── {valid: true} ──────── │                     │
        │                            │                           │                     │
   5.   │◀── 200 + weather data ──── │                           │                     │
        │                            │                           │                     │
   6.   │                            │── POST /x402/settle ────▶ │                     │
        │                            │                           │── release() ───────▶│
        │                            │                           │  (withdraw to seller)│
        │                            │                           │◀── txId ─────────── │
        │                            │◀── {success, txId} ────── │              RELEASED│
        │                            │                           │                     │
```

### The Three Components

**1. Facilitator** (`facilitator.js` — port 8402)

The trusted intermediary that verifies payments and triggers settlement. It exposes two endpoints:

- `POST /x402/verify` — Queries the nano contract state on the Hathor full node. Checks that the escrow is `LOCKED`, the amount is sufficient, the seller address matches, the facilitator address matches, and the `token_uid` matches the requested `asset`. Returns `{valid: true}` or `{valid: false, invalidReason: "..."}`.
- `POST /x402/settle` — Calls `release()` on the escrow contract, which withdraws the escrowed funds to the seller's address. Returns the settlement transaction ID.

The facilitator needs its own funded wallet to sign `release()` transactions.

**2. Resource Server** (`resource-server.js` — port 3000)

Any HTTP server that sells access to a resource. This POC sells weather data and accepts **multiple tokens** — HTR and an optional custom token (e.g. hUSDC). The x402 middleware:

1. If no `X-Payment` header → returns **402** with payment requirements (scheme, amount, seller, facilitator, blueprint ID)
2. If `X-Payment` present → calls the facilitator to **verify** the escrow
3. If valid → serves the resource, then asks the facilitator to **settle** (async)

**3. Client** (`client.js`)

An AI agent / script that wants to access a paid resource. The flow:

1. Makes a regular HTTP request → gets **402 Payment Required** with one or more payment options
2. **Picks a payment option** from the `accepts` array (by token preference)
3. Creates an **X402Escrow nano contract** on Hathor — deposits the required amount in the chosen token
4. Retries the request with the `X-Payment` header containing the `ncId`
5. Receives the resource

Supports `--token htr` or `--token custom` to choose which token to pay with.

## The X402Escrow Blueprint

The heart of the system is a [Hathor nano contract](https://hathor.network/resources/nano-contracts/) deployed on-chain. It implements a simple three-phase escrow:

```
                    ┌─────────────────────┐
                    │                     │
  initialize()      │      LOCKED         │
  + deposit ───────▶│                     │
                    │  funds held in      │
                    │  contract on-chain  │
                    │                     │
                    └──────┬────────┬─────┘
                           │        │
              release()    │        │  refund()
              by facilitator│       │  by buyer/facilitator
              withdraw to  │        │  or anyone after deadline
              seller       │        │  withdraw to buyer
                           ▼        ▼
                    ┌──────────┐  ┌──────────┐
                    │ RELEASED │  │ REFUNDED │
                    └──────────┘  └──────────┘
```

**Key properties:**
- **Zero double-spend risk** — funds are locked on-chain, not in a pre-signed transaction
- **Built-in refunds** — buyer can cancel anytime; anyone can refund after the deadline (dead man's switch)
- **Trustless verification** — anyone can query the contract state on a public full node
- **One escrow per payment** — clean isolation, each `ncId` is a receipt
- **Token-agnostic** — works with HTR or any custom Hathor token (stablecoins, etc.)

The blueprint source is in [`blueprint/x402_escrow.py`](blueprint/x402_escrow.py).

## Why Nano Contracts (Not Pre-Signed Transactions)

The naive approach for UTXO chains is pre-signed transactions — the client signs a transaction offline and hands it to the facilitator. But this has a fundamental flaw: **the client can double-spend the UTXOs before the facilitator submits**.

|                    | Pre-Signed TX                           | Nano Contract Escrow                        |
| ------------------ | --------------------------------------- | ------------------------------------------- |
| Double-spend risk  | **High** — client can spend UTXOs       | **Zero** — funds locked on-chain            |
| Verification       | Off-chain signature check               | **On-chain state query** — trustless        |
| Refund on timeout  | Impossible without timelock hacks       | **Built-in** — contract refunds             |
| Trust model        | Must trust facilitator won't hold tx    | **Trustless** — contract enforces rules     |

## Quick Start with Hathor Forge

The fastest way to run this POC is with [Hathor Forge](https://github.com/HathorNetwork/hathor-forge), which spins up a local Hathor blockchain with all services.

### Prerequisites

- Node.js 18+
- [Hathor Forge](https://github.com/HathorNetwork/hathor-forge) installed

### 1. Start Hathor Forge

```bash
hathor-forge-cli --start
```

This starts a local full node, miner, tx-mining service, and wallet-headless.

### 2. Create and fund wallets

Using the Hathor Forge MCP tools or CLI:

```bash
# Create wallets
hathor-forge create-wallet buyer
hathor-forge create-wallet facilitator
hathor-forge create-wallet seller

# Fund the buyer (needs HTR to pay for resources)
hathor-forge fund-wallet buyer --amount 100

# Fund the facilitator (needs HTR for tx fees on release/refund)
hathor-forge fund-wallet facilitator --amount 10
```

### 3. Publish the X402Escrow blueprint

```bash
hathor-forge publish-blueprint facilitator --code blueprint/x402_escrow.py
```

Note the returned `blueprint_id`.

### 4. Configure

```bash
cp .env.example .env
# Edit .env with your values:
#   FULLNODE_URL, WALLET_HEADLESS_URL (from hathor-forge)
#   BLUEPRINT_ID (from step 3)
#   BUYER_ADDRESS, FACILITATOR_ADDRESS, SELLER_ADDRESS (from wallet creation)
```

### 5. Install and run

```bash
npm install

# Terminal 1: Start the facilitator
node facilitator.js

# Terminal 2: Start the resource server
node resource-server.js

# Terminal 3: Run the client (defaults to HTR)
node client.js

# Or pay with a custom token (e.g. hUSDC)
node client.js --token custom
```

### Expected output

```
[CLIENT] === x402 Payment Flow Demo ===
[CLIENT] Step 1: Requesting weather data...
[CLIENT] Got 402 Payment Required
[CLIENT]   Amount: 100 cents (1 HTR)
[CLIENT]   Pay to: WZe3ty22NNua6N6BWRPXFqfmcTJyr2zrdq
[CLIENT]
[CLIENT] Step 2: Creating escrow nano contract...
[CLIENT] Escrow created! ncId=00000832e422...
[CLIENT] Escrow tx confirmed on-chain
[CLIENT]
[CLIENT] Step 3: Retrying request with payment proof...
[CLIENT]
[CLIENT] === Resource Received! ===
[CLIENT] {
  "location": "Sao Paulo, Brazil",
  "temperature": 28,
  "humidity": 65,
  "condition": "Partly cloudy"
}
[CLIENT]
[CLIENT] === x402 Payment Flow Complete ===
```

On the facilitator side:

```
[FACILITATOR] Verify request for ncId=00000832e422...
[FACILITATOR] Verification PASSED
[FACILITATOR] Settle request for ncId=00000832e422...
[FACILITATOR] Calling release() — withdrawing 100 to seller WZe3ty22...
[FACILITATOR] Settlement SUCCESS — txId=0000286c14be...
```

## Docker

```bash
# Build
docker build -t x402-poc .

# Run facilitator
docker run -p 8402:8402 --env-file .env x402-poc

# Run resource server
docker run -p 3000:3000 --env-file .env x402-poc node resource-server.js

# Run client
docker run --env-file .env x402-poc node client.js
```

## Protocol Messages

### 402 Response (Server -> Client)

The `accepts` array can contain **multiple payment options** with different tokens. The client picks whichever it can pay with:

```json
{
  "accepts": [
    {
      "scheme": "hathor-escrow",
      "network": "hathor:privatenet",
      "asset": "00",
      "amount": "100",
      "description": "Pay 1.00 HTR",
      "payTo": "WZe3ty22...",
      "extra": {
        "facilitatorUrl": "http://localhost:8402",
        "facilitatorAddress": "WcwKaUE5...",
        "blueprintId": "00000022..."
      }
    },
    {
      "scheme": "hathor-escrow",
      "network": "hathor:privatenet",
      "asset": "000003e3...",
      "amount": "1000",
      "description": "Or pay 10.00 hUSDC",
      "payTo": "WZe3ty22...",
      "extra": { "..." : "..." }
    }
  ]
}
```

> **Note on `asset` field:** Following the x402 spec, the field is called `asset` (not `tokenUid`). For Hathor, the asset value is the token UID — `"00"` for HTR or the hex hash of a custom token.

### X-Payment Header (Client -> Server)

```json
{
  "scheme": "hathor-escrow",
  "network": "hathor:privatenet",
  "payload": {
    "ncId": "00000832...",
    "depositTxId": "00000832...",
    "buyerAddress": "Wk1PQJJk..."
  }
}
```

### Verify / Settle (Server -> Facilitator)

See [`facilitator.js`](facilitator.js) for the full request/response formats.

## Project Structure

```
x402-poc/
├── blueprint/
│   └── x402_escrow.py       # Nano contract blueprint (Python 3.11)
├── facilitator.js            # Facilitator server (:8402)
├── resource-server.js        # Example paid API (:3000)
├── client.js                 # AI agent / buyer script
├── config.js                 # Shared configuration (env vars)
├── helpers.js                # Shared HTTP helpers
├── Dockerfile                # Container image
├── .env.example              # Environment template
└── package.json
```

## What's Next

This is a POC. A production implementation would include:

- **`@hathor/x402-client`** — TypeScript SDK wrapping the client flow
- **`@hathor/x402-server`** — Express/Fastify middleware (one-liner to add x402 to any API)
- **Facilitator as headless plugin** — Runs inside `hathor-wallet-headless` process, not as a standalone server
- **Refund monitor** — Background job watching for expired escrows
- **Payment channels** — Pre-funded escrows for repeat clients (lower latency)
- **Explorer integration** — X402Escrow detection and dashboard in hathor-explorer

## References

- [x402 Protocol Specification](https://www.x402.org/)
- [Hathor Nano Contracts](https://hathor.network/resources/nano-contracts/)
- [RFC: x402 Support for Hathor Network](https://github.com/HathorNetwork/rfcs/blob/feat/x402-support/projects/x402/0001-x402-support.md)
- [Hathor Forge](https://github.com/HathorNetwork/hathor-forge) — Local development environment

## License

MIT
