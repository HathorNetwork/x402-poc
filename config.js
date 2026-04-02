// x402 POC Configuration
// Override any value with environment variables

const env = process.env;

module.exports = {
  // Hathor services
  fullnodeUrl: env.FULLNODE_URL || 'http://127.0.0.1:8080',
  walletHeadlessUrl: env.WALLET_HEADLESS_URL || 'http://localhost:8000',

  // Blueprint published on-chain
  blueprintId: env.BLUEPRINT_ID || '',

  // Wallet IDs (must be pre-created in wallet-headless)
  buyerWalletId: env.BUYER_WALLET_ID || 'buyer',
  facilitatorWalletId: env.FACILITATOR_WALLET_ID || 'facilitator',
  sellerWalletId: env.SELLER_WALLET_ID || 'seller',

  // Addresses (first address of each wallet)
  buyerAddress: env.BUYER_ADDRESS || '',
  facilitatorAddress: env.FACILITATOR_ADDRESS || '',
  sellerAddress: env.SELLER_ADDRESS || '',

  // Token UIDs
  htrTokenUid: '00',
  customTokenUid: env.CUSTOM_TOKEN_UID || '',

  // Ports
  facilitatorPort: parseInt(env.FACILITATOR_PORT || '8402'),
  resourceServerPort: parseInt(env.RESOURCE_SERVER_PORT || '3000'),

  // Escrow settings
  escrowDeadlineSeconds: parseInt(env.ESCROW_DEADLINE_SECONDS || '300'),

  // Payment amounts (in smallest unit — 1 HTR = 100, 1 hUSDC = 100)
  htrPaymentAmount: parseInt(env.HTR_PAYMENT_AMOUNT || '100'),
  customTokenPaymentAmount: parseInt(env.CUSTOM_TOKEN_PAYMENT_AMOUNT || '1000'),
};
