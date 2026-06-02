import {
  GetBalanceParams,
  GetAddressParams,
  GetUtxosParams,
  UtxoDetails,
  SendTransactionParams,
  SendTransactionResponse,
  SignWithAddressParams,
  SignWithAddressResponse,
} from '@/types/hathor';
import Client from '@walletconnect/sign-client';
import { SessionTypes } from '@walletconnect/types';
import { Network } from '@/lib/config';

type RequestFunction = <T = any>(method: string, params?: any) => Promise<T>;

export class HathorRPCService {
  private useMock: boolean;
  private client: Client | undefined;
  private session: SessionTypes.Struct | undefined;
  private customRequest: RequestFunction | undefined;
  private network: Network;

  constructor(
    useMock: boolean = false,
    client?: Client,
    session?: SessionTypes.Struct,
    customRequest?: RequestFunction,
    network: Network = 'testnet'
  ) {
    this.useMock = useMock;
    this.client = client;
    this.session = session;
    this.customRequest = customRequest;
    this.network = network;
  }

  updateClientAndSession(
    client?: Client,
    session?: SessionTypes.Struct,
    customRequest?: RequestFunction,
    network?: Network
  ) {
    this.client = client;
    this.session = session;
    this.customRequest = customRequest;
    if (network) {
      this.network = network;
    }
  }

  setNetwork(network: Network) {
    this.network = network;
  }

  async request<T = any>(method: string, params?: any): Promise<T> {
    if (this.useMock) {
      return this.mockRequest<T>(method, params);
    }

    if (this.customRequest) {
      try {
        const result = await this.customRequest<T>(method, params);
        // eslint-disable-next-line no-console
        console.log(`RPC [${method}] response:`, result);
        return result;
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error(`RPC [${method}] failed via custom request:`, error);
        throw new Error(error?.message || 'RPC request failed');
      }
    }

    if (!this.client || !this.session) {
      throw new Error('Wallet not connected. Please connect your wallet.');
    }

    try {
      // eslint-disable-next-line no-console
      console.log(
        `RPC [${method}] via WalletConnect (chain: hathor:${this.network}, topic: ${this.session.topic.slice(0, 8)}...)`
      );
      const result = await this.client.request<T>({
        chainId: `hathor:${this.network}`,
        topic: this.session.topic,
        request: { method, params },
      });
      // eslint-disable-next-line no-console
      console.log(`RPC [${method}] response:`, result);
      return result;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(`RPC [${method}] failed via WalletConnect:`, error);
      throw new Error(error?.message || 'RPC request failed');
    }
  }

  // --- typed wrappers --------------------------------------------------------

  async getConnectedNetwork(): Promise<{ network: string; genesisHash: string }> {
    return this.request('htr_getConnectedNetwork');
  }

  async getBalance(params: GetBalanceParams): Promise<{ response: any[] }> {
    return this.request('htr_getBalance', params);
  }

  // Every rpc-handler method returns `{type, response: {...actual data...}}`
  // (see hathor-rpc-lib/packages/hathor-rpc-handler/src/rpcMethods/*.ts).
  // Unwrap so callers get the inner shape directly. Snap responses sometimes
  // double-wrap (response.response.*), so fall back to that too.
  private unwrap<T>(raw: any): T {
    if (raw && typeof raw === 'object') {
      if (raw.response && typeof raw.response === 'object') {
        const inner = raw.response;
        if (inner.response && typeof inner.response === 'object') return inner.response as T;
        return inner as T;
      }
    }
    return raw as T;
  }

  async getAddress(
    params: GetAddressParams
  ): Promise<{ address: string; index: number; addressPath: string }> {
    const raw = await this.request<any>('htr_getAddress', params);
    return this.unwrap(raw);
  }

  async getWalletInformation(): Promise<{ address0: string; network: string }> {
    const raw = await this.request<any>('htr_getWalletInformation');
    return this.unwrap(raw);
  }

  // Regular Hathor transaction send (no nano contracts). Implemented by the
  // desktop wallet (hathor-wallet/src/sagas/reown.js:81), mobile wallet
  // (hathor-wallet-mobile/src/sagas/reown.js:165), and the MetaMask snap
  // (hathor-rpc-lib/packages/snap/src/index.tsx:81).
  async sendTransaction(params: SendTransactionParams): Promise<SendTransactionResponse> {
    const raw = await this.request<any>('htr_sendTransaction', params);
    return this.unwrap(raw);
  }

  // Sign an arbitrary message with the key of a specific wallet address.
  // Returns a Bitcoin-compatible signed-message signature (bitcore.Message).
  // We use this to bind a server-issued requestId to the payer.
  async signWithAddress(params: SignWithAddressParams): Promise<SignWithAddressResponse> {
    const raw = await this.request<any>('htr_signWithAddress', params);
    return this.unwrap(raw);
  }

  // List the wallet's available UTXOs, optionally filtered to one address.
  // We use this to pre-select UTXOs at address-0 so the resulting tx's inputs
  // are guaranteed to come from there.
  async getUtxos(params: GetUtxosParams): Promise<UtxoDetails> {
    const raw = await this.request<any>('htr_getUtxos', params);
    return this.unwrap(raw);
  }

  // --- helpers ---------------------------------------------------------------

  // Extract a txId from the various shapes the RPC response can take.
  static extractTxId(resp: SendTransactionResponse): string | undefined {
    return (
      resp?.hash ||
      resp?.txId ||
      resp?.response?.hash ||
      resp?.response?.response?.hash
    );
  }

  // --- mock --- (development only) -------------------------------------------

  private async mockRequest<T>(method: string, params?: any): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    switch (method) {
      case 'htr_getConnectedNetwork':
        return { network: 'testnet', genesisHash: '0x123...' } as T;

      case 'htr_getBalance':
        return {
          response: [
            {
              token: { id: '00', name: 'Hathor', symbol: 'HTR' },
              balance: { unlocked: 1250.5, locked: 0 },
              tokenAuthorities: {
                unlocked: { mint: false, melt: false },
                locked: { mint: false, melt: false },
              },
              transactions: 42,
              lockExpires: null,
            },
          ],
        } as T;

      case 'htr_getAddress': {
        const index = params?.index ?? 0;
        return {
          address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
          index,
          addressPath: `m/44'/280'/0'/0/${index}`,
        } as T;
      }

      case 'htr_getWalletInformation':
        return { address0: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp', network: 'testnet' } as T;

      case 'htr_sendTransaction': {
        const fakeHash =
          '00000000' +
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
        return { hash: fakeHash, success: true } as T;
      }

      case 'htr_signWithAddress': {
        const idx = params?.addressIndex ?? 0;
        return {
          message: params?.message ?? '',
          signature: 'H' + Buffer.from(`mock-${idx}-${Date.now()}`).toString('base64'),
          address: {
            address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
            index: idx,
            addressPath: `m/44'/280'/0'/0/${idx}`,
          },
        } as T;
      }

      case 'htr_getUtxos': {
        return {
          total_amount_available: 100000,
          total_utxos_available: 1,
          total_amount_locked: 0,
          total_utxos_locked: 0,
          utxos: [
            {
              address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
              amount: 100000,
              tx_id: '00mock' + Math.random().toString(36).substring(2, 15),
              index: 0,
              locked: false,
            },
          ],
        } as T;
      }

      default:
        throw new Error(`Mock not implemented for method: ${method}`);
    }
  }
}
