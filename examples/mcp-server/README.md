# x402 Payment-Gated MCP Server

A minimal example of an MCP server with payment-gated tools using x402 on Hathor Network.

## What this demonstrates

- **`get_weather`** tool: Costs 1.00 HTR per call via hathor-escrow
- **`get_price`** tool: Free — returns pricing info for any tool

When an AI agent calls `get_weather` without payment, it receives a 402-style response with Hathor escrow payment requirements. The agent creates an escrow, includes the payment proof, and gets the data.

## Setup

```bash
cd examples/mcp-server
npm install
```

## Running

```bash
FACILITATOR_URL=https://facilitator.x402.hathor.dev \
SELLER_ADDRESS=WZe3ty22... \
FACILITATOR_ADDRESS=Wb6eLTZS... \
BLUEPRINT_ID=0000121e... \
node server.js
```

## Using with Claude Code

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "x402-weather": {
      "command": "node",
      "args": ["/path/to/examples/mcp-server/server.js"],
      "env": {
        "FACILITATOR_URL": "https://facilitator.x402.hathor.dev",
        "SELLER_ADDRESS": "WZe3ty22...",
        "FACILITATOR_ADDRESS": "Wb6eLTZS...",
        "BLUEPRINT_ID": "0000121e..."
      }
    }
  }
}
```

## Payment flow

```
Agent                    MCP Server              Facilitator        Hathor
  |                          |                        |               |
  |-- get_weather(city) ---->|                        |               |
  |<---- 402 + accepts[] ----|                        |               |
  |                          |                        |               |
  |-- create escrow ---------|------------------------|----deposit---->|
  |                          |                        |               |
  |-- get_weather(city, ---->|                        |               |
  |     payment=proof)       |-- verify ------------->|               |
  |                          |<--- valid: true -------|               |
  |                          |-- settle ------------->|--release()---->|
  |                          |<--- txId --------------|               |
  |<---- weather data -------|                        |               |
```
