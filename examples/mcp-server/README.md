# x402 Payment-Gated MCP Server

A minimal MCP server whose `get_weather` tool is gated by an x402 `hathor-direct`
payment. AI agents (Claude Code, etc.) call the tool, receive a 402-style
response with payment requirements, send a regular Hathor payment on-chain,
sign the server-issued `requestId` with the payer key, and re-call the tool
with the payment proof.

No facilitator, no nano contracts, no escrow.

## What this demonstrates

- `get_weather` — costs `PRICE_PER_CALL` atomic units (default 100 = 1.00 HTR).
- `get_price` — free; returns the current pricing + a fresh `requestId`.

## Setup

```bash
cd examples/mcp-server
npm install
```

You'll need:

- A Hathor address you control (the **seller** address) where payments land
- A 32-byte secret to HMAC `requestId`s with

## Running

```bash
FULLNODE_URL=https://node1.testnet.hathor.network \
HATHOR_NETWORK=testnet \
SELLER_ADDRESS=WZe3ty22...your_address... \
SERVER_SECRET=$(openssl rand -hex 32) \
PRICE_PER_CALL=100 \
node server.js
```

## Using with Claude Code

Add to your MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "x402-weather": {
      "command": "node",
      "args": ["/abs/path/to/examples/mcp-server/server.js"],
      "env": {
        "FULLNODE_URL": "https://node1.testnet.hathor.network",
        "HATHOR_NETWORK": "testnet",
        "SELLER_ADDRESS": "WZe3ty22...",
        "SERVER_SECRET": "..."
      }
    }
  }
}
```

## Payment flow

```
Agent                       MCP server               Hathor fullnode
  |                              |                         |
  |-- get_weather(city) -------->|                         |
  |<-- 402 + accepts[] ----------|                         |
  |                              |                         |
  |-- send_tokens(amount,payTo)----------send tx---------->|
  |    (regular Hathor payment;                            |
  |     no contract, no escrow)                            |
  |                              |                         |
  |-- sign(requestId) ---->[wallet]                        |
  |                              |                         |
  |-- get_weather(city, payment=base64(payload)) --------->|
  |                              |-- fetch tx, check sig,  |
  |                              |   dedup, zero-conf safety
  |                              |                         |
  |<-- weather data + payment ---|                         |
```

The `payment` argument is a base64-encoded JSON `PaymentPayload`:

```jsonc
{
  "x402Version": 2,
  "scheme": "hathor-direct",
  "network": "hathor:testnet",
  "payload": {
    "txId": "000abc…",
    "payerAddress": "WPo2…",
    "signature": "BASE64…",        // bitcore.Message signature of requestId
    "requestId": "<base64url(claims)>.<base64url(mac)>"
  }
}
```

## Notes

- Dedup ledger lives at `./data/payments.sqlite` by default. Override with
  `DEDUP_DB_PATH`.
- Zero-confirmation is accepted (the verifier rejects voided/conflicting txs
  at verify time; a real production deployment would also wire a post-serve
  void watcher and a blocklist).
- This example reuses the top-level `verifier.js` / `dedupStore.js` /
  `requestId.js` modules. Run `npm install` from the example directory to
  pull `better-sqlite3` (needed by the dedup store).
