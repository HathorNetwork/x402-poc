'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WalletState } from '@/types';
import { HathorRPCService } from '@/lib/hathorRPC';
import { useUnifiedWallet } from './UnifiedWalletContext';
import { config, Network } from '@/lib/config';

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
  sendNanoContractTx: (params: {
    network: Network;
    nc_id?: string;
    blueprint_id?: string;
    method: string;
    args: any[];
    actions: Array<{
      type: 'deposit' | 'withdrawal';
      amount: string;
      token: string;
      address?: string;
    }>;
    push_tx: boolean;
  }) => Promise<any>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const BALANCE_CACHE_KEY = 'hathor_balance_cache';
const BALANCE_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

interface BalanceCache {
  balance: string; // Store as string since bigint can't be JSON serialized
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

  // Load cached balance from localStorage
  const loadCachedBalance = (addr: string): bigint | null => {
    try {
      const cached = localStorage.getItem(BALANCE_CACHE_KEY);
      if (!cached) return null;

      const cache: BalanceCache = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is for the same address and is still valid (less than 15 minutes old)
      if (cache.address === addr && (now - cache.timestamp) < BALANCE_CACHE_DURATION) {
        return BigInt(cache.balance);
      }

      return null;
    } catch (error) {
      console.error('Failed to load cached balance:', error);
      return null;
    }
  };

  // Save balance to cache
  const saveCachedBalance = (addr: string, bal: bigint) => {
    try {
      const cache: BalanceCache = {
        balance: bal.toString(),
        timestamp: Date.now(),
        address: addr,
      };
      localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save cached balance:', error);
    }
  };

  // Define fetchBalance before it's used in useEffect
  const fetchBalance = async (addr: string, forceRefresh: boolean = false, tokenUid: string = '00', network: Network = 'mainnet') => {
    if (!addr) return;

    // Don't use cache - always fetch fresh balance to ensure authorization
    if (config.useMockWallet) {
      setBalance(100000n);
      setBalanceVerified(true);
      saveCachedBalance(addr, 100000n);
      return;
    }

    // Update RPC service network before making request
    rpcService.setNetwork(network);

    setIsLoadingBalance(true);
    setBalanceVerified(false); // Reset verified state while fetching new balance
    try {
      const balanceInfo = await rpcService.getBalance({
        network,
        tokens: [tokenUid],
      });

      console.log('Balance response:', balanceInfo);

      // Handle both direct response and nested response format (MetaMask Snap wraps response)
      const responseData = (balanceInfo as any)?.response?.response || balanceInfo?.response;
      const balanceData = responseData?.[0]?.balance?.unlocked;

      // Convert to bigint - value is already in cents from API
      const balanceValue = typeof balanceData === 'number'
        ? BigInt(Math.floor(balanceData))
        : (typeof balanceData === 'bigint' ? balanceData : 0n);

      console.log('Parsed balance:', balanceValue.toString());

      setBalance(balanceValue);
      setBalanceVerified(true);
      saveCachedBalance(addr, balanceValue);
    } catch (error: any) {
      console.error('Balance fetch failed:', {
        message: error?.message,
        code: error?.code,
        data: error?.data,
        raw: error,
      });
      setBalance(0n);
      setBalanceVerified(false);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Update rpcService and fetch balance when wallet connects
  useEffect(() => {
    console.log('WalletContext useEffect - adapter state:', {
      isConnected: adapter?.isConnected,
      address: adapter?.address,
      hasRequest: !!adapter?.request,
    });

    if (adapter?.isConnected && adapter.address) {
      // Update rpcService with adapter's request function
      console.log('Updating rpcService with adapter.request');
      rpcService.updateClientAndSession(undefined, undefined, adapter.request);
      // Update address - balance fetch is handled by page.tsx with correct token
      setAddress(adapter.address);
    } else if (!adapter?.isConnected) {
      setAddress(null);
      setBalance(0n);
    }
  }, [adapter?.isConnected, adapter?.address, adapter?.request, rpcService]);

  // Convert balance from cents (bigint) to token units (number) for backwards compatibility
  const walletBalance = typeof balance === 'bigint' ? Number(balance) / 100 : 0;

  const connectWallet = () => {
    setConnected(true);
    setAddress('0x7a3f...9b2c');
    setBalance(100000n);
  };

  const disconnectWallet = () => {
    setConnected(false);
    setAddress(null);
    setBalance(0n);
    setBalanceVerified(false);
    setIsLoadingBalance(false);
  };

  // Generic method to send nano contract transactions
  const sendNanoContractTx = async (params: {
    network: Network;
    nc_id?: string;
    blueprint_id?: string;
    method: string;
    args: any[];
    actions: Array<{
      type: 'deposit' | 'withdrawal';
      amount: string;
      token: string;
      address?: string;
    }>;
    push_tx: boolean;
  }) => {
    if (!adapter?.isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    // Update RPC service network before making request
    rpcService.setNetwork(params.network);

    console.log('Sending nano contract tx with params:', params);

    try {
      const result = await rpcService.sendNanoContractTx(params);
      console.log('Nano contract tx successful:', result);
      return result;
    } catch (error) {
      console.error('Failed to send nano contract tx:', error);
      throw error;
    }
  };

  const refreshBalance = async (tokenUid: string = '00', network: Network = 'mainnet') => {
    if (address) {
      await fetchBalance(address, true, tokenUid, network); // Force refresh
    }
  };

  return (
    <WalletContext.Provider value={{
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
      sendNanoContractTx,
    }}>
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
