import { Network, config } from './config';
import { ContractState, BlueprintInfo, ContractHistory } from '@/types/hathor';

export class HathorCoreAPI {
  private baseUrl: string;

  constructor(network: Network) {
    this.baseUrl = config.hathorNodeUrls[network];
  }

  async getBlueprintInfo(blueprintId: string): Promise<BlueprintInfo> {
    const response = await fetch(`${this.baseUrl}/nc_blueprint/${blueprintId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch blueprint info: ${response.statusText}`);
    }
    return response.json();
  }

  async getContractState(contractId: string, fields: string[] = ['token_uid', 'available_tokens', 'total_liquidity_provided']): Promise<ContractState> {
    const queryString = fields.map(field => `fields[]=${field}`).join('&');
    const response = await fetch(`${this.baseUrl}/nano_contract/state?id=${contractId}&${queryString}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch contract state: ${response.statusText}`);
    }
    const data = await response.json();

    // Build state object from all returned fields
    const state: ContractState = {
      token_uid: data.fields?.token_uid?.value || '00',
      available_tokens: BigInt(data.fields?.available_tokens?.value || 0),
      total_liquidity_provided: BigInt(data.fields?.total_liquidity_provided?.value || 0),
    };

    // Add any additional fields that were returned
    if (data.fields) {
      for (const [key, fieldData] of Object.entries(data.fields)) {
        if (!(key in state) && fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
          state[key] = (fieldData as any).value;
        }
      }
    }

    return state;
  }

  async getContractHistory(contractId: string, limit: number = 50, after?: string): Promise<ContractHistory> {
    let url = `${this.baseUrl}/nano_contract/history?id=${contractId}&count=${limit}&include_nc_events=true`;
    if (after) {
      url += `&after=${after}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch contract history: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      transactions: data.history?.map((tx: any) => ({
        tx_id: tx.hash,
        timestamp: tx.timestamp,
        nc_method: tx.nc_method,
        nc_caller: tx.nc_address,
        first_block: tx.first_block,
        is_voided: tx.is_voided,
        nc_args_decoded: tx.nc_args_decoded,
        nc_events: tx.nc_events,
      })) || [],
      total: data.history?.length || 0,
      hasMore: data.has_more || false,
    };
  }

  async getTransaction(txId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/transaction?id=${txId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch transaction: ${response.statusText}`);
    }
    return response.json();
  }

  async callViewFunction(contractId: string, method: string, args: any[] = [], callerAddress?: string): Promise<any> {
    const body: any = {
      id: contractId,
      method,
      args,
    };

    if (callerAddress) {
      body.caller = callerAddress;
    }

    // Construct query parameters properly
    const params = new URLSearchParams();
    params.append('id', contractId);
    params.append('calls[]', `${method}(${args.map(arg => JSON.stringify(arg)).join(', ')})`);

    const response = await fetch(`${this.baseUrl}/nano_contract/state?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to call view function: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  async getMaximumLiquidityRemoval(contractId: string, callerAddress: string): Promise<bigint> {
    const result = await this.callViewFunction(contractId, 'calculate_address_maximum_liquidity_removal', [callerAddress], callerAddress);
    // The result is in calls['calculate_address_maximum_liquidity_removal()'].value
    if (result.calls) {
      // Get the first (and should be only) call result
      const callKey = Object.keys(result.calls)[0];
      if (callKey && result.calls[callKey]?.value !== undefined) {
        return BigInt(result.calls[callKey].value);
      }
    }
    return 0n;
  }

  async getClaimableBalance(contractId: string, callerAddress: string): Promise<bigint> {
    const result = await this.callViewFunction(contractId, 'get_address_balance', [callerAddress], callerAddress);
    // The result is in calls['get_address_balance("ADDRESS")'].value
    if (result.calls) {
      // Get the first (and should be only) call result
      const callKey = Object.keys(result.calls)[0];
      if (callKey && result.calls[callKey]?.value !== undefined) {
        return BigInt(result.calls[callKey].value);
      }
    }
    return 0n;
  }

  async getTokenInfo(tokenUid: string): Promise<{ symbol: string; name: string } | null> {
    // HTR native token
    if (tokenUid === '00' || /^0+$/.test(tokenUid)) {
      return { symbol: 'HTR', name: 'Hathor' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/thin_wallet/token?id=${tokenUid}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        symbol: data.symbol || tokenUid.slice(0, 8),
        name: data.name || 'Unknown Token',
      };
    } catch (error) {
      console.error('Failed to fetch token info:', error);
      return null;
    }
  }
}
