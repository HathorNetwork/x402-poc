'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import Client from '@walletconnect/sign-client';
import { PairingTypes, SessionTypes } from '@walletconnect/types';
import { Web3Modal } from '@web3modal/standalone';
import { getSdkError } from '@walletconnect/utils';
import { WALLETCONNECT_PROJECT_ID } from '@/lib/walletConnectConfig';
import { initializeWalletConnectClient } from '@/lib/walletConnectClient';
import { Network } from '@/lib/config';

interface IWalletConnectContext {
  client: Client | undefined;
  session: SessionTypes.Struct | undefined;
  connect: (targetNetwork?: Network, pairing?: { topic: string }) => Promise<void>;
  disconnect: () => Promise<void>;
  chains: string[];
  pairings: PairingTypes.Struct[];
  accounts: string[];
  setChains: React.Dispatch<React.SetStateAction<string[]>>;
  getFirstAddress: () => string;
  getConnectedNetwork: () => Network | null;
  isConnected: boolean;
  isInitializing: boolean;
}

const WalletConnectContext = createContext<IWalletConnectContext>({} as IWalletConnectContext);

const web3Modal = new Web3Modal({
  projectId: WALLETCONNECT_PROJECT_ID,
  themeMode: 'dark',
  walletConnectVersion: 2,
});

export function WalletConnectProvider({ children }: { children: ReactNode | ReactNode[] }) {
  const [client, setClient] = useState<Client>();
  const [pairings, setPairings] = useState<PairingTypes.Struct[]>([]);
  const [session, setSession] = useState<SessionTypes.Struct>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [chains, setChains] = useState<string[]>([]);
  const [clientInitialized, setClientInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const initializationAttempted = useRef(false);

  const reset = () => {
    setSession(undefined);
    setAccounts([]);
    setChains([]);
    localStorage.removeItem('wallet_type');
    localStorage.removeItem('address');
  };

  const onSessionConnected = useCallback(async (_session: SessionTypes.Struct) => {
    const allNamespaceAccounts = Object.values(_session.namespaces)
      .map((namespace) => namespace.accounts)
      .flat();
    const allNamespaceChains = Object.keys(_session.namespaces);

    setSession(_session);
    setChains(allNamespaceChains);
    setAccounts(allNamespaceAccounts);

    // Store wallet type and address in localStorage
    localStorage.setItem('wallet_type', 'walletconnect');
    if (_session.namespaces.hathor?.accounts?.[0]) {
      const [, , address] = _session.namespaces.hathor.accounts[0].split(':');
      localStorage.setItem('address', address);
    }
  }, []);

  const getFirstAddress = useCallback(() => {
    if (!session?.namespaces?.hathor?.accounts?.[0]) {
      return '';
    }
    const [, , addr] = session.namespaces.hathor.accounts[0].split(':');
    return addr;
  }, [session]);

  const getConnectedNetwork = useCallback((): Network | null => {
    if (!session?.namespaces?.hathor?.accounts?.[0]) {
      return null;
    }
    const [, network] = session.namespaces.hathor.accounts[0].split(':');
    return network as Network;
  }, [session]);

  const subscribeToEvents = useCallback(
    async (_client: Client) => {
      if (!_client) {
        throw new Error('WalletConnect is not initialized');
      }

      _client.on('session_ping', (args) => {
        console.log('EVENT', 'session_ping', args);
      });

      _client.on('session_event', (args) => {
        console.log('EVENT', 'session_event', args);
      });

      _client.on('session_update', ({ topic, params }) => {
        console.log('EVENT', 'session_update', { topic, params });
        const { namespaces } = params;
        const _session = _client.session.get(topic);
        const updatedSession = { ..._session, namespaces };
        onSessionConnected(updatedSession);
      });

      _client.on('session_delete', () => {
        console.log('EVENT', 'session_delete');
        reset();
      });
    },
    [onSessionConnected]
  );

  const checkPersistedState = useCallback(
    async (_client: Client) => {
      if (!_client) {
        throw new Error('WalletConnect is not initialized');
      }
      setPairings(_client.pairing.getAll({ active: true }));

      if (session) return;
      if (_client.session.length) {
        const lastKeyIndex = _client.session.keys.length - 1;
        const _session = _client.session.get(_client.session.keys[lastKeyIndex]);
        await onSessionConnected(_session);
        return _session;
      }
    },
    [session, onSessionConnected]
  );

  useEffect(() => {
    if (client && !clientInitialized) {
      (async () => {
        try {
          await subscribeToEvents(client);
          await checkPersistedState(client);
          setClientInitialized(true);
        } catch (error) {
          console.error('Failed to setup WalletConnect:', error);
        }
      })();
    }
  }, [client, clientInitialized, subscribeToEvents, checkPersistedState]);

  useEffect(() => {
    if (initializationAttempted.current || isInitializing || client) return;

    initializationAttempted.current = true;
    setIsInitializing(true);
    (async () => {
      try {
        const _client = await initializeWalletConnectClient();
        setClient(_client);
      } catch (error) {
        console.error('Failed to initialize WalletConnect on mount:', error);
        initializationAttempted.current = false;
      } finally {
        setIsInitializing(false);
      }
    })();
  }, []);

  const connect = useCallback(
    async (targetNetwork?: Network, pairing?: { topic: string }) => {
      if (!client) {
        throw new Error('WalletConnect client is not initialized yet. Please wait a moment and try again.');
      }

      if (session) {
        return;
      }

      // Default to testnet if no network specified
      const dappNetwork = targetNetwork || 'privatenet';

      let unsubscribe: (() => void) | undefined;

      try {
        const requiredNamespaces = {
          hathor: {
            methods: [
              'htr_getAddress',
              'htr_getBalance',
              'htr_getUtxos',
              'htr_signWithAddress',
              'htr_sendNanoContractTx',
            ],
            chains: [`hathor:${dappNetwork}`],
            events: [],
          },
        };

        const { uri, approval } = await client.connect({
          pairingTopic: pairing?.topic,
          requiredNamespaces,
        });

        if (uri) {
          const standaloneChains = Object.values(requiredNamespaces)
            .map((namespace) => namespace.chains)
            .flat() as string[];

          web3Modal.openModal({ uri, standaloneChains });
        }

        const modalClosedPromise = new Promise<never>((_, reject) => {
          unsubscribe = web3Modal.subscribeModal((state) => {
            if (!state.open) {
              reject(new Error('User closed the modal'));
            }
          });
        });

        const newSession = await Promise.race([approval(), modalClosedPromise]);

        // Extract network from the connected session
        const connectedAccount = newSession.namespaces?.hathor?.accounts?.[0];
        if (connectedAccount) {
          const [, walletNetwork] = connectedAccount.split(':');

          // Validate network matches
          if (walletNetwork !== dappNetwork) {
            // Disconnect the session since networks don't match
            await client.disconnect({
              topic: newSession.topic,
              reason: getSdkError('USER_DISCONNECTED'),
            });
            throw new Error(`Network mismatch: wallet is on ${walletNetwork} but dapp requires ${dappNetwork}. Please switch your wallet to ${dappNetwork} and try again.`);
          }
        }

        await onSessionConnected(newSession);
        setPairings(client.pairing.getAll({ active: true }));
      } catch (e) {
        console.error('Failed to connect:', e);
        throw e;
      } finally {
        if (unsubscribe) {
          unsubscribe();
        }
        web3Modal.closeModal();
      }
    },
    [client, session, onSessionConnected]
  );

  const disconnect = useCallback(async () => {
    if (!client) {
      throw new Error('WalletConnect is not initialized');
    }
    if (!session) {
      throw new Error('Session is not connected');
    }

    try {
      await client.disconnect({
        topic: session.topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });
    } catch (error) {
      console.error('SignClient.disconnect failed:', error);
    } finally {
      reset();
    }
  }, [client, session]);

  const value = useMemo(
    () => ({
      pairings,
      accounts,
      chains,
      client,
      session,
      connect,
      disconnect,
      getFirstAddress,
      getConnectedNetwork,
      setChains,
      isConnected: !!session,
      isInitializing,
    }),
    [pairings, accounts, chains, client, session, connect, disconnect, getFirstAddress, getConnectedNetwork, setChains, isInitializing]
  );

  return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
}

export function useWalletConnect() {
  const context = useContext(WalletConnectContext);
  if (context === undefined) {
    throw new Error('useWalletConnect must be used within a WalletConnectProvider');
  }
  return context;
}
