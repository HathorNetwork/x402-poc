import Client from '@walletconnect/sign-client';
import { WALLETCONNECT_PROJECT_ID, WALLETCONNECT_METADATA, RELAY_URL } from './walletConnectConfig';

let client: Client | null = null;

export async function initializeWalletConnectClient(): Promise<Client> {
  if (client) {
    return client;
  }

  try {
    client = await Client.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      relayUrl: RELAY_URL,
      metadata: WALLETCONNECT_METADATA,
    });
    return client;
  } catch (error) {
    console.error('Failed to initialize WalletConnect client:', error);
    throw error;
  }
}

export function getWalletConnectClient(): Client {
  if (!client) {
    throw new Error('WalletConnect client is not initialized');
  }
  return client;
}
