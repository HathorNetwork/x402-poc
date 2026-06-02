'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { HathorCoreAPI } from '@/lib/hathorCoreAPI';
import { config, Network } from '@/lib/config';
import { useWalletConnect } from './WalletConnectContext';
import { useMetaMask } from './MetaMaskContext';
import { useWallet } from './WalletContext';

interface HathorContextType {
  isConnected: boolean;
  address: string | null;
  network: Network;
  coreAPI: HathorCoreAPI;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetwork: (network: Network) => Promise<void>;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, walletConnect.isConnected, metaMask.isConnected]);

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
