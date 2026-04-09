'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { WalletAdapter, WalletType } from '@/types/wallet';
import { useMetaMask } from './MetaMaskContext';
import { useWalletConnect } from './WalletConnectContext';

interface UnifiedWalletContextType {
  adapter: WalletAdapter | null;
  walletType: WalletType;
  setWalletType: (type: WalletType) => void;
}

const UnifiedWalletContext = createContext<UnifiedWalletContextType | undefined>(undefined);

export function UnifiedWalletProvider({ children }: { children: ReactNode }) {
  const metaMask = useMetaMask();
  const walletConnect = useWalletConnect();
  const [walletType, setWalletTypeState] = useState<WalletType>(null);

  // Load wallet type from localStorage on mount
  useEffect(() => {
    const storedWalletType = localStorage.getItem('wallet_type') as WalletType;
    if (storedWalletType) {
      setWalletTypeState(storedWalletType);
    }
  }, []);

  // Update wallet type when connections change
  useEffect(() => {
    if (metaMask.isConnected && walletType !== 'metamask') {
      setWalletTypeState('metamask');
    } else if (walletConnect.isConnected && walletType !== 'walletconnect') {
      setWalletTypeState('walletconnect');
    } else if (!metaMask.isConnected && !walletConnect.isConnected && walletType !== null) {
      setWalletTypeState(null);
    }
  }, [metaMask.isConnected, walletConnect.isConnected, walletType]);

  // Determine which adapter to use based on wallet type
  const adapter: WalletAdapter | null = (() => {
    if (walletType === 'metamask' && metaMask.isConnected) {
      return {
        isConnected: metaMask.isConnected,
        isInitializing: false,
        address: metaMask.address,
        connect: metaMask.connect,
        disconnect: metaMask.disconnect,
        request: metaMask.request,
      };
    } else if (walletType === 'walletconnect' && walletConnect.isConnected) {
      const connectedNetwork = walletConnect.getConnectedNetwork() || 'privatenet';
      return {
        isConnected: walletConnect.isConnected,
        isInitializing: walletConnect.isInitializing,
        address: walletConnect.getFirstAddress(),
        connect: () => walletConnect.connect(undefined),
        disconnect: walletConnect.disconnect,
        request: async <T = any>(method: string, params?: any): Promise<T> => {
          if (!walletConnect.client || !walletConnect.session) {
            throw new Error('WalletConnect not connected');
          }
          return walletConnect.client.request<T>({
            chainId: `hathor:${connectedNetwork}`,
            topic: walletConnect.session.topic,
            request: { method, params },
          });
        },
      };
    }
    return null;
  })();

  const setWalletType = (type: WalletType) => {
    setWalletTypeState(type);
    if (type) {
      localStorage.setItem('wallet_type', type);
    } else {
      localStorage.removeItem('wallet_type');
    }
  };

  return (
    <UnifiedWalletContext.Provider value={{ adapter, walletType, setWalletType }}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

export function useUnifiedWallet() {
  const context = useContext(UnifiedWalletContext);
  if (context === undefined) {
    throw new Error('useUnifiedWallet must be used within a UnifiedWalletProvider');
  }
  return context;
}
