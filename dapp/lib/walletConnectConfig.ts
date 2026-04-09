export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

// Customize these values for your dApp
export const WALLETCONNECT_METADATA = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Hathor dApp',
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Decentralized application on Hathor Network',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://your-dapp.com',
  icons: [typeof window !== 'undefined' ? `${window.location.origin}/images/icon.png` : 'https://your-dapp.com/images/icon.png'],
};

export const RELAY_URL = 'wss://relay.walletconnect.com';
