#!/usr/bin/env node

// x402-gated MCP server — single-tool example.
//
// `get_weather` returns weather data only if the caller includes a valid
// `payment` argument (base64-encoded x402 PaymentPayload pointing at an
// on-chain hathor-direct payment). The server verifies the payment locally
// via the shared verifier — no facilitator, no escrow, no nano contracts.
//
// Run:
//   SELLER_ADDRESS=WZe3...  SERVER_SECRET=...  node server.js
//
// Use with Claude Code: see README.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { openStore } = require('../../dedupStore.js');
const { mintRequestId } = require('../../requestId.js');
const { verifyDirectPayment } = require('../../verifier.js');

// --- config ----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEDUP = path.join(__dirname, 'data', 'payments.sqlite');

const cfg = {
  fullnodeUrl: process.env.FULLNODE_URL || 'https://node1.testnet.hathor.network',
  network: process.env.HATHOR_NETWORK || 'testnet',
  sellerAddress: process.env.SELLER_ADDRESS || '',
  serverSecret: process.env.SERVER_SECRET || '',
  requestIdTtlSeconds: parseInt(process.env.REQUEST_ID_TTL_SECONDS || '120', 10),
  htrTokenUid: '00',
  pricePerCall: parseInt(process.env.PRICE_PER_CALL || '100', 10),
  dedupDbPath: process.env.DEDUP_DB_PATH || DEFAULT_DEDUP,
  resourceBase: process.env.MCP_RESOURCE_BASE || 'mcp://x402-mcp-server',
};

if (!cfg.sellerAddress) {
  // eslint-disable-next-line no-console
  console.error('[x402-mcp] WARNING: SELLER_ADDRESS unset — 402 responses will be invalid');
}
if (!cfg.serverSecret) {
  // eslint-disable-next-line no-console
  console.error('[x402-mcp] WARNING: SERVER_SECRET unset — requestId verification will reject everything');
}

const store = openStore(cfg.dedupDbPath);

// --- 402 + verify helpers --------------------------------------------------

function buildPaymentRequired(toolName) {
  const resource = `${cfg.resourceBase}/tool/${toolName}`;
  const network = `hathor:${cfg.network}`;
  const requestId = mintRequestId(
    {
      route: resource,
      amount: String(cfg.pricePerCall),
      payTo: cfg.sellerAddress,
      asset: cfg.htrTokenUid,
      network,
    },
    cfg.serverSecret || 'dev-fallback-secret',
    cfg.requestIdTtlSeconds
  );
  return {
    x402Version: 2,
    accepts: [{
      scheme: 'hathor-direct',
      network,
      resource,
      amount: String(cfg.pricePerCall),
      asset: cfg.htrTokenUid,
      payTo: cfg.sellerAddress,
      maxTimeoutSeconds: cfg.requestIdTtlSeconds,
      description: `Pay ${(cfg.pricePerCall / 100).toFixed(2)} HTR for ${toolName}`,
      extra: { requestId },
    }],
  };
}

async function verifyPayment(paymentArg, toolName) {
  let payload;
  try {
    payload = typeof paymentArg === 'string'
      ? JSON.parse(Buffer.from(paymentArg, 'base64').toString('utf-8'))
      : paymentArg;
  } catch (_) {
    return { valid: false, invalidReason: 'invalid_payment_encoding' };
  }

  const resource = `${cfg.resourceBase}/tool/${toolName}`;
  const requirement = {
    scheme: 'hathor-direct',
    network: `hathor:${cfg.network}`,
    amount: String(cfg.pricePerCall),
    asset: cfg.htrTokenUid,
    payTo: cfg.sellerAddress,
    resource,
  };

  return verifyDirectPayment({
    payload,
    requirements: requirement,
    fullnodeUrl: cfg.fullnodeUrl,
    dedupStore: store,
    serverSecret: cfg.serverSecret,
    zeroConfMaxAmount: Number.MAX_SAFE_INTEGER,
  });
}

// --- MCP server ------------------------------------------------------------

const server = new McpServer({
  name: 'x402-weather',
  version: '0.2.0',
});

server.tool(
  'get_weather',
  'Get current weather for a city. Costs 1.00 HTR per call via x402 hathor-direct payment.',
  {
    city: z.string().describe('City name (e.g., "Sao Paulo")'),
    payment: z.string().optional().describe('Base64-encoded x402 hathor-direct PaymentPayload (JSON)'),
  },
  async ({ city, payment }) => {
    if (!payment) {
      const requirements = buildPaymentRequired('get_weather');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'payment_required',
            status: 402,
            message: `This tool costs ${(cfg.pricePerCall / 100).toFixed(2)} HTR per call. Include a "payment" argument (base64 JSON) with a hathor-direct PaymentPayload.`,
            ...requirements,
          }, null, 2),
        }],
        isError: true,
      };
    }

    const verification = await verifyPayment(payment, 'get_weather');
    if (!verification.valid) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'payment_invalid',
            reason: verification.invalidReason,
            ...buildPaymentRequired('get_weather'),
          }, null, 2),
        }],
        isError: true,
      };
    }

    const data = {
      city,
      temperature: Math.round(20 + Math.random() * 15),
      humidity: Math.round(40 + Math.random() * 40),
      condition: ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain'][Math.floor(Math.random() * 4)],
      wind: `${Math.round(5 + Math.random() * 20)} km/h`,
      timestamp: new Date().toISOString(),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          data,
          payment: {
            x402Version: 2,
            success: true,
            scheme: 'hathor-direct',
            network: `hathor:${cfg.network}`,
            transaction: verification.txId,
            payer: verification.payerAddress,
            amount: String(verification.amount),
            idempotent: !!verification.idempotent,
          },
        }, null, 2),
      }],
    };
  },
);

// Free tool: pricing/discovery.
server.tool(
  'get_price',
  'Get the current x402 price + payment requirements for a tool. Free.',
  { tool_name: z.string().describe('Tool name to check pricing for') },
  async ({ tool_name }) => {
    const requirements = buildPaymentRequired(tool_name);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          tool: tool_name,
          price: `${(cfg.pricePerCall / 100).toFixed(2)} HTR`,
          network: `hathor:${cfg.network}`,
          paymentInfo: requirements,
        }, null, 2),
      }],
    };
  },
);

// --- Run -------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[x402-mcp] Running on stdio');
  // eslint-disable-next-line no-console
  console.error(`[x402-mcp] Seller: ${cfg.sellerAddress}`);
  // eslint-disable-next-line no-console
  console.error(`[x402-mcp] Network: ${cfg.network} via ${cfg.fullnodeUrl}`);
  // eslint-disable-next-line no-console
  console.error(`[x402-mcp] Dedup store: ${cfg.dedupDbPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[x402-mcp] Fatal: ${err.message}`);
  process.exit(1);
});
