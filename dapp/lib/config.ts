export type Network = 'mainnet' | 'testnet' | 'privatenet';

export const config = {
  useMockWallet: process.env.NEXT_PUBLIC_USE_MOCK_WALLET === 'true',
  defaultNetwork: (process.env.NEXT_PUBLIC_DEFAULT_NETWORK || 'testnet') as Network,
  hathorNodeUrls: {
    privatenet:
      process.env.NEXT_PUBLIC_HATHOR_NODE_URL_PRIVATENET ||
      'https://node1.playground.testnet.hathor.network/v1a',
    testnet:
      process.env.NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET ||
      'https://node1.testnet.hathor.network/v1a',
    mainnet:
      process.env.NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET ||
      'https://node1.mainnet.hathor.network/v1a',
  },

  // x402 resource-server URL (where /weather, /generate, etc. live).
  resourceServerUrl:
    process.env.NEXT_PUBLIC_RESOURCE_SERVER_URL || 'http://localhost:3000',

  // Default URL the X402Fetch input box is seeded with.
  get defaultDemoUrl() {
    return `${this.resourceServerUrl}/weather`;
  },
};
