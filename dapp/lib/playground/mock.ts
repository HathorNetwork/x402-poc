// Static data + formatting helpers for the Agent Playground.
// (Previously held the mock wallet/tx generators — payments are real now;
// the wallet lives behind the /api/* proxy routes.)

export type AgentStatus = 'active' | 'paused' | 'revoked';

export interface PlaygroundEndpoint {
  id: string;
  method: 'GET';
  path: string;
  description: string;
  priceAtomic: number; // hUSDC atomic units (1 hUSDC = 100)
}

export const TOKEN_SYMBOL = 'hUSDC';

export function formatAmount(atomic: number): string {
  return (atomic / 100).toFixed(2);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function explorerTxUrl(txId: string): string {
  return `https://explorer.testnet.hathor.network/transaction/${txId}`;
}

export const PLAYGROUND_ENDPOINTS: PlaygroundEndpoint[] = [
  {
    id: 'weather',
    method: 'GET',
    path: '/api/weather',
    description: 'Real-time weather data for any city',
    priceAtomic: 1, // 0.01 hUSDC
  },
  {
    id: 'market-data',
    method: 'GET',
    path: '/api/market-data',
    description: 'Live crypto market prices and 24h changes',
    priceAtomic: 10, // 0.10 hUSDC
  },
];
