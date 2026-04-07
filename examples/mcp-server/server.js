#!/usr/bin/env node

// x402 Payment-Gated MCP Server Example
//
// Demonstrates how to build an MCP server where tool calls require x402 payment
// on Hathor Network. AI agents (Claude Code, etc.) can discover and pay for tools.
//
// Flow:
//   1. Agent calls a tool (e.g., get_weather)
//   2. Server returns a 402-style error with payment requirements
//   3. Agent creates an escrow on Hathor, sends payment proof
//   4. Server verifies + settles via the facilitator, returns data
//
// Usage:
//   FACILITATOR_URL=https://facilitator.x402.hathor.dev \
//   SELLER_ADDRESS=WZe3... \
//   BLUEPRINT_ID=0000121e... \
//   node server.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = {
  facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.x402.hathor.dev',
  facilitatorAddress: process.env.FACILITATOR_ADDRESS || '',
  sellerAddress: process.env.SELLER_ADDRESS || '',
  blueprintId: process.env.BLUEPRINT_ID || '',
  network: process.env.HATHOR_NETWORK || 'testnet',
  htrTokenUid: '00',
  pricePerCall: 100, // 1.00 HTR in smallest units
  deadlineSeconds: 300,
};

// ---------------------------------------------------------------------------
// x402 helpers
// ---------------------------------------------------------------------------

function buildPaymentRequired(toolName) {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: 'hathor-escrow',
        network: `hathor:${config.network}`,
        resource: `mcp://x402-mcp-server/tool/${toolName}`,
        mimeType: 'application/json',
        payTo: config.sellerAddress,
        maxTimeoutSeconds: config.deadlineSeconds,
        asset: config.htrTokenUid,
        price: String(config.pricePerCall),
        description: `Pay ${(config.pricePerCall / 100).toFixed(2)} HTR for ${toolName}`,
        extra: {
          facilitatorUrl: config.facilitatorUrl,
          facilitatorAddress: config.facilitatorAddress,
          blueprintId: config.blueprintId,
          deadlineSeconds: config.deadlineSeconds,
        },
      },
    ],
  };
}

async function verifyAndSettle(paymentProof) {
  const paymentPayload = typeof paymentProof === 'string'
    ? JSON.parse(Buffer.from(paymentProof, 'base64').toString('utf-8'))
    : paymentProof;

  // Verify
  const verifyResp = await fetch(`${config.facilitatorUrl}/x402/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: [{
        scheme: 'hathor-escrow',
        network: `hathor:${config.network}`,
        maxAmountRequired: String(config.pricePerCall),
        payTo: config.sellerAddress,
        asset: config.htrTokenUid,
      }],
    }),
  });
  const verification = await verifyResp.json();
  if (!verification.valid) {
    throw new Error(`Payment invalid: ${verification.invalidReason}`);
  }

  // Settle
  const settleResp = await fetch(`${config.facilitatorUrl}/x402/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentPayload }),
  });
  const settlement = await settleResp.json();
  if (!settlement.success) {
    throw new Error(`Settlement failed: ${settlement.error}`);
  }

  return settlement;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'x402-weather',
  version: '0.1.0',
});

// Paid tool: get_weather
server.tool(
  'get_weather',
  'Get current weather for a city. Costs 1.00 HTR per call via x402 payment.',
  {
    city: z.string().describe('City name (e.g., "Sao Paulo")'),
    payment: z.string().optional().describe('Base64-encoded x402 PAYMENT-SIGNATURE (hathor-escrow proof)'),
  },
  async ({ city, payment }) => {
    // No payment? Return 402-style payment requirements
    if (!payment) {
      const requirements = buildPaymentRequired('get_weather');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'payment_required',
              status: 402,
              message: `This tool costs ${(config.pricePerCall / 100).toFixed(2)} HTR per call. Include a "payment" parameter with your x402 payment proof.`,
              ...requirements,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Verify and settle payment
    let settlement;
    try {
      settlement = await verifyAndSettle(payment);
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'payment_failed', message: err.message }) }],
        isError: true,
      };
    }

    // Payment confirmed — return the weather data
    const weatherData = {
      city,
      temperature: Math.round(20 + Math.random() * 15),
      humidity: Math.round(40 + Math.random() * 40),
      condition: ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain'][Math.floor(Math.random() * 4)],
      wind: `${Math.round(5 + Math.random() * 20)} km/h`,
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: weatherData,
            payment: {
              x402Version: 2,
              success: true,
              scheme: 'hathor-escrow',
              network: `hathor:${config.network}`,
              settleTxId: settlement.txId,
            },
          }, null, 2),
        },
      ],
    };
  },
);

// Free tool: get_price (shows how to mix free and paid tools)
server.tool(
  'get_price',
  'Get the current x402 price for a tool call. Free — no payment needed.',
  {
    tool_name: z.string().describe('Name of the tool to check pricing for'),
  },
  async ({ tool_name }) => {
    const requirements = buildPaymentRequired(tool_name);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tool: tool_name,
            price: `${(config.pricePerCall / 100).toFixed(2)} HTR`,
            network: `hathor:${config.network}`,
            paymentInfo: requirements,
          }, null, 2),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[x402-mcp-server] Running on stdio');
  console.error(`[x402-mcp-server] Seller: ${config.sellerAddress}`);
  console.error(`[x402-mcp-server] Facilitator: ${config.facilitatorUrl}`);
  console.error(`[x402-mcp-server] Price per call: ${(config.pricePerCall / 100).toFixed(2)} HTR`);
}

main().catch(err => {
  console.error(`[x402-mcp-server] Fatal: ${err.message}`);
  process.exit(1);
});
