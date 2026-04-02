/**
 * Wallet Adapter Interface
 * This interface defines the contract that all wallet implementations must follow.
 * It allows WalletContext to work with any wallet type without knowing the specifics.
 */

export interface WalletAdapter {
  // Connection state
  isConnected: boolean;
  isInitializing?: boolean;
  address: string | null;

  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // RPC request method - all wallet operations go through this
  request: <T = any>(method: string, params?: any) => Promise<T>;
}

export type WalletType = 'walletconnect' | 'metamask' | null;
