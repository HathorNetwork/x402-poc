import { HathorRPCRequest, HathorRPCResponse, GetBalanceParams, GetAddressParams, SendNanoContractTxParams } from '@/types/hathor';
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

  constructor(useMock: boolean = false, client?: Client, session?: SessionTypes.Struct, customRequest?: RequestFunction, network: Network = 'mainnet') {
    this.useMock = useMock;
    this.client = client;
    this.session = session;
    this.customRequest = customRequest;
    this.network = network;
  }

  updateClientAndSession(client?: Client, session?: SessionTypes.Struct, customRequest?: RequestFunction, network?: Network) {
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

    // Use custom request function if provided (e.g., MetaMask)
    if (this.customRequest) {
      try {
        const result = await this.customRequest<T>(method, params);
        return result;
      } catch (error: any) {
        console.error('RPC request failed:', error);
        throw new Error(error?.message || 'RPC request failed');
      }
    }

    // Fall back to WalletConnect
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected. Please connect your wallet.');
    }

    try {
      const result = await this.client.request<T>({
        chainId: `hathor:${this.network}`,
        topic: this.session.topic,
        request: {
          method,
          params,
        },
      });

      return result;
    } catch (error: any) {
      console.error('RPC request failed:', error);
      throw new Error(error?.message || 'RPC request failed');
    }
  }

  async getConnectedNetwork(): Promise<{ network: string; genesisHash: string }> {
    return this.request('htr_getConnectedNetwork');
  }

  async getBalance(params: GetBalanceParams): Promise<{ response: any[] }> {
    return this.request('htr_getBalance', params);
  }

  async getAddress(params: GetAddressParams): Promise<{ address: string; index: number; addressPath: string }> {
    return this.request('htr_getAddress', params);
  }

  async getWalletInformation(): Promise<{ address0: string; network: string }> {
    return this.request('htr_getWalletInformation');
  }

  async sendNanoContractTx(params: SendNanoContractTxParams): Promise<any> {
    return this.request('htr_sendNanoContractTx', params);
  }

  private async mockRequest<T>(method: string, params?: any): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 500));

    switch (method) {
      case 'htr_getConnectedNetwork':
        return { network: 'testnet', genesisHash: '0x123...' } as T;

      case 'htr_getBalance':
        return {
          response: [{
            token: { id: '00', name: 'Hathor', symbol: 'HTR' },
            balance: { unlocked: 1250.50, locked: 0 },
            tokenAuthorities: { unlocked: { mint: false, melt: false }, locked: { mint: false, melt: false } },
            transactions: 42,
            lockExpires: null,
          }]
        } as T;

      case 'htr_getAddress':
        return { address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp', index: 0, addressPath: "m/44'/280'/0'/0/0" } as T;

      case 'htr_getWalletInformation':
        return { address0: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp', network: 'testnet' } as T;

      case 'htr_sendNanoContractTx':
        return {
          hash: '00000000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
          success: true,
          timestamp: Date.now(),
          nonce: Math.floor(Math.random() * 1000000),
        } as T;

      default:
        throw new Error(`Mock not implemented for method: ${method}`);
    }
  }
}
