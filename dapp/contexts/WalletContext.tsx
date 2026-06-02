'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { HathorRPCService } from '@/lib/hathorRPC';
import { useUnifiedWallet } from './UnifiedWalletContext';
import { config, Network } from '@/lib/config';
import type {
  GetAddressParams,
  GetUtxosParams,
  UtxoDetails,
  SendTransactionParams,
  SendTransactionResponse,
  SignWithAddressParams,
  SignWithAddressResponse,
} from '@/types/hathor';

// Read-only balance fallback via the fullnode — used when WalletConnect RPC
// rejects htr_getBalance (e.g. on certain wallets / mock mode).
async function fetchBalanceFromFullnode(
  address: string,
  tokenUid: string,
  network: Network
): Promise<bigint> {
  const nodeUrl = config.hathorNodeUrls[network];
  const resp = await fetch(`${nodeUrl}/thin_wallet/address_balance?address=${address}`);
  if (!resp.ok) throw new Error(`Fullnode balance query failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error(`Fullnode balance query error: ${data.message}`);
  const tokenBalance = data.tokens_data?.[tokenUid];
  if (!tokenBalance) return 0n;
  return BigInt(tokenBalance.received - tokenBalance.spent);
}

interface WalletContextType {
  connected: boolean;
  address: string | null;
  balance: bigint;
  walletBalance: number;
  balanceVerified: boolean;
  isLoadingBalance: boolean;
  connectWallet: () => void;
  disconnectWallet: () => void;
  setBalance: React.Dispatch<React.SetStateAction<bigint>>;
  refreshBalance: (tokenUid?: string, network?: Network) => Promise<void>;

  // x402 hathor-direct primitives — the RPC methods we actually need.
  getAddress: (params: GetAddressParams) => Promise<{ address: string; index: number; addressPath: string }>;
  sendTransaction: (params: SendTransactionParams) => Promise<SendTransactionResponse>;
  signWithAddress: (params: SignWithAddressParams) => Promise<SignWithAddressResponse>;
  getUtxos: (params: GetUtxosParams) => Promise<UtxoDetails>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const BALANCE_CACHE_KEY = 'hathor_balance_cache';
const BALANCE_CACHE_DURATION = 15 * 60 * 1000;

interface BalanceCache {
  balance: string;
  timestamp: number;
  address: string;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { adapter } = useUnifiedWallet();
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [balanceVerified, setBalanceVerified] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [rpcService] = useState(() => new HathorRPCService(config.useMockWallet));

  const saveCachedBalance = (addr: string, bal: bigint) => {
    try {
      const cache: BalanceCache = { balance: bal.toString(), timestamp: Date.now(), address: addr };
      localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save cached balance:', error);
    }
  };

  const fetchBalance = async (
    addr: string,
    _forceRefresh: boolean = false,
    tokenUid: string = '00',
    network: Network = 'testnet'
  ) => {
    if (!addr) return;

    if (config.useMockWallet) {
      setBalance(100000n);
      setBalanceVerified(true);
      saveCachedBalance(addr, 100000n);
      return;
    }

    rpcService.setNetwork(network);

    setIsLoadingBalance(true);
    setBalanceVerified(false);
    try {
      const balanceInfo = await rpcService.getBalance({
        network,
        tokens: [tokenUid],
      });

      const responseData = (balanceInfo as any)?.response?.response || balanceInfo?.response;
      const balanceData = responseData?.[0]?.balance?.unlocked;

      const balanceValue =
        typeof balanceData === 'number'
          ? BigInt(Math.floor(balanceData))
          : typeof balanceData === 'bigint'
            ? balanceData
            : 0n;

      setBalance(balanceValue);
      setBalanceVerified(true);
      saveCachedBalance(addr, balanceValue);
    } catch (error: any) {
      console.error('Balance fetch via wallet RPC failed; trying fullnode fallback:', error?.message);
      try {
        const balanceValue = await fetchBalanceFromFullnode(addr, tokenUid, network);
        setBalance(balanceValue);
        setBalanceVerified(true);
        saveCachedBalance(addr, balanceValue);
      } catch (fallbackError: any) {
        console.error('Fullnode balance fallback also failed:', fallbackError?.message);
        setBalance(0n);
        setBalanceVerified(false);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (adapter?.isConnected && adapter.address) {
      rpcService.updateClientAndSession(undefined, undefined, adapter.request);
      setAddress(adapter.address);
    } else if (!adapter?.isConnected) {
      setAddress(null);
      setBalance(0n);
    }
  }, [adapter?.isConnected, adapter?.address, adapter?.request, rpcService]);

  const walletBalance = typeof balance === 'bigint' ? Number(balance) / 100 : 0;

  const connectWallet = () => {
    setConnected(true);
  };

  const disconnectWallet = () => {
    setConnected(false);
    setAddress(null);
    setBalance(0n);
    setBalanceVerified(false);
    setIsLoadingBalance(false);
  };

  const ensureConnected = () => {
    if (!adapter?.isConnected) throw new Error('Wallet not connected');
  };

  const getAddress: WalletContextType['getAddress'] = async (params) => {
    ensureConnected();
    rpcService.setNetwork(params.network as Network);
    return rpcService.getAddress(params);
  };

  const sendTransaction: WalletContextType['sendTransaction'] = async (params) => {
    ensureConnected();
    rpcService.setNetwork(params.network as Network);
    return rpcService.sendTransaction(params);
  };

  const signWithAddress: WalletContextType['signWithAddress'] = async (params) => {
    ensureConnected();
    rpcService.setNetwork(params.network as Network);
    return rpcService.signWithAddress(params);
  };

  const getUtxos: WalletContextType['getUtxos'] = async (params) => {
    ensureConnected();
    rpcService.setNetwork(params.network as Network);
    return rpcService.getUtxos(params);
  };

  const refreshBalance = async (tokenUid: string = '00', network: Network = 'testnet') => {
    if (address) await fetchBalance(address, true, tokenUid, network);
  };

  return (
    <WalletContext.Provider
      value={{
        connected,
        address,
        balance,
        walletBalance,
        balanceVerified,
        isLoadingBalance,
        connectWallet,
        disconnectWallet,
        setBalance,
        refreshBalance,
        getAddress,
        sendTransaction,
        signWithAddress,
        getUtxos,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
