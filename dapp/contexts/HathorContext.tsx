'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { HathorCoreAPI } from '@/lib/hathorCoreAPI';
import { EscrowState, ContractState } from '@/types/hathor';
import { config, Network } from '@/lib/config';
import { useWalletConnect } from './WalletConnectContext';
import { useMetaMask } from './MetaMaskContext';
import { useWallet } from './WalletContext';
import { getEscrowIds, addEscrowId } from '@/lib/escrowStore';

const ESCROW_FIELDS = ['buyer', 'seller', 'facilitator', 'token_uid', 'amount', 'phase', 'deadline', 'resource_url', 'request_hash'];

interface HathorContextType {
  isConnected: boolean;
  address: string | null;
  network: Network;
  coreAPI: HathorCoreAPI;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetwork: (network: Network) => Promise<void>;
  // Compat with template components
  contractStates: Record<string, ContractState>;
  getContractStateForToken: (token: string) => ContractState | null;
  getContractIdForToken: (token: string) => string | null;
  // Escrow state
  escrows: Record<string, EscrowState>;
  isLoadingEscrows: boolean;
  refreshEscrows: () => Promise<void>;
  addEscrow: (ncId: string) => Promise<void>;
  fetchEscrowState: (ncId: string) => Promise<EscrowState | null>;
}

const HathorContext = createContext<HathorContextType | undefined>(undefined);

const NETWORK_STORAGE_KEY = 'hathor_selected_network';

const getInitialNetwork = (): Network => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (stored === 'mainnet' || stored === 'testnet') return stored;
  }
  return config.defaultNetwork;
};

export function HathorProvider({ children }: { children: ReactNode }) {
  const walletConnect = useWalletConnect();
  const metaMask = useMetaMask();
  const wallet = useWallet();
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network>(getInitialNetwork);
  const [coreAPI, setCoreAPI] = useState(() => new HathorCoreAPI(getInitialNetwork()));
  const [escrows, setEscrows] = useState<Record<string, EscrowState>>({});
  const [isLoadingEscrows, setIsLoadingEscrows] = useState(false);

  const isConnected = walletConnect.isConnected || metaMask.isConnected;

  useEffect(() => {
    setCoreAPI(new HathorCoreAPI(network));
  }, [network]);

  useEffect(() => {
    if (isConnected) {
      if (walletConnect.isConnected) {
        const addr = walletConnect.getFirstAddress();
        setAddress(addr);
        const walletNetwork = walletConnect.getConnectedNetwork();
        if (walletNetwork && walletNetwork !== network) {
          setNetwork(walletNetwork);
          localStorage.setItem(NETWORK_STORAGE_KEY, walletNetwork);
        }
      } else if (metaMask.isConnected) {
        setAddress(metaMask.address);
        if (metaMask.walletNetwork && metaMask.walletNetwork !== network) {
          setNetwork(metaMask.walletNetwork);
          localStorage.setItem(NETWORK_STORAGE_KEY, metaMask.walletNetwork);
        }
      }
    } else {
      setAddress(null);
      wallet.setBalance(0n);
    }
  }, [isConnected, walletConnect.isConnected, metaMask.isConnected, walletConnect, metaMask]);

  const fetchEscrowState = useCallback(async (ncId: string): Promise<EscrowState | null> => {
    const api = new HathorCoreAPI(network);
    let state;
    try {
      state = await api.getContractState(ncId, ESCROW_FIELDS);
    } catch {
      return null;
    }
    if (!state || !state.phase) return null;
    return {
      ncId,
      buyer: state.buyer || '',
      seller: state.seller || '',
      facilitator: state.facilitator || '',
      token_uid: state.token_uid || '00',
      amount: typeof state.amount === 'bigint' ? Number(state.amount) : (state.amount || 0),
      phase: state.phase as EscrowState['phase'],
      deadline: state.deadline || 0,
      resource_url: state.resource_url || '',
      request_hash: state.request_hash || '',
    };
  }, [network]);

  const refreshEscrows = useCallback(async () => {
    setIsLoadingEscrows(true);
    const ids = getEscrowIds();
    const results: Record<string, EscrowState> = {};

    // Mock mode
    if (config.useMockWallet && ids.length === 0) {
      setEscrows({});
      setIsLoadingEscrows(false);
      return;
    }

    for (const ncId of ids) {
      if (config.useMockWallet) {
        results[ncId] = {
          ncId,
          buyer: 'WMockBuyerAddress1234567890abcdef',
          seller: config.sellerAddress || 'WMockSellerAddr',
          facilitator: config.facilitatorAddress || 'WMockFacAddr',
          token_uid: '00',
          amount: 100,
          phase: 'LOCKED',
          deadline: Math.floor(Date.now() / 1000) + 300,
          resource_url: 'http://localhost:3001/weather',
          request_hash: 'mock-hash',
        };
        continue;
      }

      try {
        const state = await fetchEscrowState(ncId);
        if (state) results[ncId] = state;
      } catch (err) {
        // Remove stale escrow IDs that no longer exist on-chain
        console.warn(`Escrow ${ncId} not found, removing from tracker`);
        const { removeEscrowId } = await import('@/lib/escrowStore');
        removeEscrowId(ncId);
      }
    }

    setEscrows(results);
    setIsLoadingEscrows(false);
  }, [fetchEscrowState]);

  const addEscrowAndRefresh = useCallback(async (ncId: string) => {
    addEscrowId(ncId);
    const state = await fetchEscrowState(ncId);
    if (state) {
      setEscrows(prev => ({ [ncId]: state, ...prev }));
    }
  }, [fetchEscrowState]);

  // Load escrows on mount and periodically
  useEffect(() => {
    refreshEscrows();
    const interval = setInterval(refreshEscrows, 15000);
    return () => clearInterval(interval);
  }, [refreshEscrows]);

  const connectWallet = async () => {
    await walletConnect.connect(network);
  };

  const disconnectWallet = async () => {
    if (walletConnect.isConnected) await walletConnect.disconnect();
    if (metaMask.isConnected) await metaMask.disconnect();
    localStorage.removeItem('wallet_type');
  };

  const switchNetwork = async (newNetwork: Network) => {
    setNetwork(newNetwork);
    localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    if (typeof (walletConnect as any).switchNetwork === 'function') {
      (walletConnect as any).switchNetwork(newNetwork).catch(() => {});
    }
  };

  return (
    <HathorContext.Provider
      value={{
        isConnected,
        address,
        network,
        coreAPI,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        contractStates: { 'HTR': { token_uid: '00', available_tokens: 0n, total_liquidity_provided: 0n } },
        getContractStateForToken: (token: string) => token === 'HTR' ? { token_uid: '00', available_tokens: 0n, total_liquidity_provided: 0n } : null,
        getContractIdForToken: () => null,
        escrows,
        isLoadingEscrows,
        refreshEscrows,
        addEscrow: addEscrowAndRefresh,
        fetchEscrowState,
      }}
    >
      {children}
    </HathorContext.Provider>
  );
}

export function useHathor() {
  const context = useContext(HathorContext);
  if (context === undefined) {
    throw new Error('useHathor must be used within a HathorProvider');
  }
  return context;
}
