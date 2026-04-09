export interface WalletState {
  connected: boolean;
  address: string | null;
  walletBalance: number;
  contractBalance: bigint;
}
