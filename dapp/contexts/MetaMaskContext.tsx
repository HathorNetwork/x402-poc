'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HathorRPCService } from '@/lib/hathorRPC';
import { config, Network } from '@/lib/config';

interface IMetaMaskContext {
  address: string | null;
  walletNetwork: Network | null;
  isConnected: boolean;
  isInstalled: boolean;
  connect: (targetNetwork?: Network) => Promise<void>;
  disconnect: () => Promise<void>;
  request: <T = any>(method: string, params?: any) => Promise<T>;
}

const MetaMaskContext = createContext<IMetaMaskContext>({} as IMetaMaskContext);

const SNAP_ID = 'npm:@hathor/snap';
const SNAP_VERSION = '*'; // Use latest version

export function MetaMaskProvider({ children }: { children: ReactNode | ReactNode[] }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<Network | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Helper method to call MetaMask Snap and parse JSON response
  const metamask_request = useCallback(async (method: string, params?: any): Promise<any> => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    // Build request object - only include params if defined (MetaMask requires params to be object/array, not undefined)
    const request: { method: string; params?: any } = { method };
    if (params !== undefined) {
      request.params = params;
    }

    const resultStr = await window.ethereum.request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SNAP_ID,
        request,
      },
    });

    return typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
  }, []);

  // Create RPC service instance configured for MetaMask
  const [rpcService] = useState(() => new HathorRPCService(config.useMockWallet, undefined, undefined, metamask_request));

  // Check if MetaMask is installed
  useEffect(() => {
    const checkMetaMask = () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        setIsInstalled(true);
      }
    };
    checkMetaMask();
  }, []);

  // Check persisted connection on mount
  useEffect(() => {
    const checkPersistedConnection = async () => {
      if (typeof window === 'undefined' || !window.ethereum) return;

      try {
        const walletType = localStorage.getItem('wallet_type');
        if (walletType !== 'metamask') return;

        // Check if snap is already connected
        const snaps = await window.ethereum.request({
          method: 'wallet_getSnaps',
        });

        if (snaps?.[SNAP_ID]) {
          // Get wallet information from snap (no user approval required)
          const result = await rpcService.getWalletInformation();

          // MetaMask Snap returns response in nested format
          const walletInfo = (result as any)?.response || result;
          if (walletInfo?.address0) {
            setAddress(walletInfo.address0);
            setIsConnected(true);
            // Store the wallet's network
            if (walletInfo.network) {
              setWalletNetwork(walletInfo.network as Network);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check persisted MetaMask connection:', error);
      }
    };

    checkPersistedConnection();
  }, [rpcService]);

  const connect = useCallback(async (targetNetwork?: Network) => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed. Please install MetaMask extension.');
    }

    // Use provided network or default from config
    const dappNetwork = targetNetwork || config.defaultNetwork;

    try {
      // Request snap connection
      const result = await window.ethereum.request({
        method: 'wallet_requestSnaps',
        params: {
          [SNAP_ID]: {
            version: SNAP_VERSION,
          },
        },
      });

      if (!result?.[SNAP_ID]) {
        throw new Error('Failed to connect to Hathor Snap');
      }

      // Get wallet information from snap (includes network)
      const walletResult = await rpcService.getWalletInformation();

      // MetaMask Snap returns response in nested format
      const walletInfo = (walletResult as any)?.response || walletResult;
      if (!walletInfo?.address0) {
        throw new Error('Failed to get wallet information from snap');
      }

      // Check if wallet's network matches dapp's network
      const walletNetwork = walletInfo.network;
      let finalAddress = walletInfo.address0;

      if (walletNetwork !== dappNetwork) {
        console.log(`Wallet is on ${walletNetwork}, switching to ${dappNetwork}...`);
        try {
          await metamask_request('htr_changeNetwork', { network: walletNetwork, newNetwork: dappNetwork });
          // After network change, get updated wallet info with new address
          const updatedWalletResult = await rpcService.getWalletInformation();
          const updatedWalletInfo = (updatedWalletResult as any)?.response || updatedWalletResult;
          if (updatedWalletInfo?.address0) {
            finalAddress = updatedWalletInfo.address0;
            console.log(`Network switched, new address: ${finalAddress}`);
          }
        } catch (error) {
          console.warn('Failed to change network:', error);
          // Continue anyway - user can manually switch later
        }
      }

      setAddress(finalAddress);
      setIsConnected(true);
      setWalletNetwork(dappNetwork);
      localStorage.setItem('wallet_type', 'metamask');
      localStorage.setItem('address', finalAddress);
    } catch (error: any) {
      console.error('Failed to connect to MetaMask Snap:', error);
      throw new Error(error?.message || 'Failed to connect to MetaMask Snap');
    }
  }, [rpcService, metamask_request]);

  const disconnect = useCallback(async () => {
    setAddress(null);
    setWalletNetwork(null);
    setIsConnected(false);
    localStorage.removeItem('wallet_type');
    localStorage.removeItem('address');
  }, []);

  const request = useCallback(
    async <T = any,>(method: string, params?: any): Promise<T> => {
      if (!isConnected) {
        throw new Error('MetaMask Snap is not connected');
      }

      try {
        const result = await metamask_request(method, params);
        return result as T;
      } catch (error: any) {
        console.error('MetaMask Snap request failed:', error);
        throw new Error(error?.message || 'MetaMask Snap request failed');
      }
    },
    [isConnected, metamask_request]
  );

  const value = useMemo(
    () => ({
      address,
      walletNetwork,
      isConnected,
      isInstalled,
      connect,
      disconnect,
      request,
    }),
    [address, walletNetwork, isConnected, isInstalled, connect, disconnect, request]
  );

  return <MetaMaskContext.Provider value={value}>{children}</MetaMaskContext.Provider>;
}

export function useMetaMask() {
  const context = useContext(MetaMaskContext);
  if (context === undefined) {
    throw new Error('useMetaMask must be used within a MetaMaskProvider');
  }
  return context;
}
