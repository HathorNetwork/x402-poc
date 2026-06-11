// Mock data + generators for the Agent Playground simulation.
// Everything here is fake: wallet addresses, transactions, API responses.
// When real wallet integration lands, only the engine in PlaygroundContext
// should need to change — these shapes stay.

export type AgentStatus = 'active' | 'paused' | 'revoked';

export interface PlaygroundEndpoint {
  id: string;
  method: 'GET';
  path: string;
  description: string;
  priceCents: number; // HTR cents (1 HTR = 100 cents)
  mockBody: () => unknown;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const HEX = '0123456789abcdef';

function randomChars(charset: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[Math.floor(Math.random() * charset.length)];
  }
  return out;
}

// Hathor testnet addresses are base58 and start with 'W'.
export function generateMockAddress(): string {
  return `W${randomChars(BASE58, 33)}`;
}

export function generateMockTxId(): string {
  return randomChars(HEX, 64);
}

export function formatHTR(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export const PLAYGROUND_ENDPOINTS: PlaygroundEndpoint[] = [
  {
    id: 'weather',
    method: 'GET',
    path: '/api/weather',
    description: 'Real-time weather data for any city',
    priceCents: 1, // 0.01 HTR
    mockBody: () => ({
      city: 'São Paulo',
      temp_c: 24,
      feels_like_c: 26,
      conditions: 'Partly Cloudy',
      humidity: 63,
      wind: { speed_kmh: 12, direction: 'NE' },
      forecast: [
        { day: 'Tomorrow', high: 27, low: 19, conditions: 'Sunny' },
        { day: 'In 2 days', high: 25, low: 18, conditions: 'Partly Cloudy' },
        { day: 'In 3 days', high: 22, low: 17, conditions: 'Rain Showers' },
      ],
    }),
  },
  {
    id: 'market-data',
    method: 'GET',
    path: '/api/market-data',
    description: 'Live crypto market prices and 24h changes',
    priceCents: 10, // 0.10 HTR
    mockBody: () => ({
      base: 'USD',
      prices: {
        HTR: { price: 0.041, change_24h_pct: 3.4 },
        BTC: { price: 104250.0, change_24h_pct: -1.2 },
        ETH: { price: 5230.5, change_24h_pct: 0.8 },
      },
      updated_at: new Date().toISOString(),
    }),
  },
  {
    id: 'research',
    method: 'GET',
    path: '/api/research',
    description: 'AI-generated research summary with sources',
    priceCents: 50, // 0.50 HTR
    mockBody: () => ({
      topic: 'HTTP-native micropayments for AI agents',
      summary:
        'The x402 protocol revives the HTTP 402 status code to let machines pay ' +
        'for resources per request. On Hathor, payments settle as regular UTXO ' +
        'transactions with no fees, making sub-cent API pricing viable.',
      key_points: [
        'No accounts or API keys — the wallet is the identity',
        'Per-request pricing instead of subscriptions',
        'Feeless settlement on Hathor enables true micropayments',
        'Spending policies are enforced agent-side before signing',
      ],
      sources: [
        { title: 'x402 protocol specification', url: 'https://x402.org' },
        { title: 'Hathor Network docs', url: 'https://docs.hathor.network' },
      ],
    }),
  },
];
