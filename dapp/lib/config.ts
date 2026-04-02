export type Network = 'mainnet' | 'testnet' | 'privatenet';

export const config = {
  useMockWallet: process.env.NEXT_PUBLIC_USE_MOCK_WALLET === 'true',
  defaultNetwork: (process.env.NEXT_PUBLIC_DEFAULT_NETWORK || 'privatenet') as Network,
  hathorNodeUrls: {
    'privatenet': process.env.NEXT_PUBLIC_HATHOR_NODE_URL_PRIVATENET || 'http://127.0.0.1:49180/v1a',
    'testnet': process.env.NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET || 'https://node1.india.testnet.hathor.network/v1a',
    'mainnet': process.env.NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET || 'https://node1.mainnet.hathor.network/v1a',
  },

  // x402 Escrow config
  blueprintId: process.env.NEXT_PUBLIC_BLUEPRINT_ID || '',
  facilitatorAddress: process.env.NEXT_PUBLIC_FACILITATOR_ADDRESS || '',
  sellerAddress: process.env.NEXT_PUBLIC_SELLER_ADDRESS || '',
  escrowDeadlineSeconds: parseInt(process.env.NEXT_PUBLIC_ESCROW_DEADLINE_SECONDS || '300'),
};
