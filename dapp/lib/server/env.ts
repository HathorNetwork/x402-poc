// Server-only configuration for the headless-wallet proxy routes.
// Never expose these via NEXT_PUBLIC_* — the headless controls real funds.

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const serverEnv = {
  // Later the headless moves to a server: only this URL changes.
  headlessUrl: process.env.HEADLESS_URL || 'http://localhost:8002',
  // The real wallet-id is NOT committed — set HEADLESS_WALLET_ID in the
  // deployment env (and in dapp/.env.local for local dev).
  walletId: process.env.HEADLESS_WALLET_ID || 'default',
  tokenUid:
    process.env.HUSDC_TOKEN_UID ||
    '001adcc82ba9722714c849cf607d30cd3cd9c7e95b0b3cb58e1eb476fa346980',
  fundAmountAtomic: int(process.env.FUND_AMOUNT_ATOMIC, 500), // 5.00 hUSDC
  // All hUSDC sits at the wallet's address 0 (the treasury). Funding txs must
  // filter inputs to it AND send change back to it — otherwise change lands on
  // a fresh address and corrupts future user allocations.
  treasuryAddress:
    process.env.TREASURY_ADDRESS || 'WUcVUnahHUuGqFD52rgaM5Ef1HMG4ycMYg',
};
