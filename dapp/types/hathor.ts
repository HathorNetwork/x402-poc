export interface ContractState {
  token_uid: string;
  available_tokens: bigint;
  total_liquidity_provided: bigint;
  [key: string]: any;
}

export interface EscrowState {
  ncId: string;
  buyer: string;
  seller: string;
  facilitator: string;
  token_uid: string;
  amount: number;
  phase: 'LOCKED' | 'RELEASED' | 'REFUNDED';
  deadline: number;
  resource_url: string;
  request_hash: string;
}

export interface BlueprintInfo {
  id: string;
  name: string;
  public_methods: string[];
  attributes: Record<string, string>;
}

export interface ContractHistory {
  transactions: ContractTransaction[];
  total: number;
  hasMore: boolean;
}

export interface NanoContractEvent {
  data: string;
}

export interface ContractTransaction {
  tx_id: string;
  timestamp: number;
  nc_method: string;
  nc_caller: string;
  first_block: string | null;
  is_voided: boolean;
  nc_args_decoded?: number[];
  nc_events?: NanoContractEvent[];
  contractId?: string;
}

export interface HathorRPCRequest {
  method: string;
  params?: any;
}

export interface HathorRPCResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface GetBalanceParams {
  network: string;
  tokens: string[];
  addressIndexes?: number[];
}

export interface GetAddressParams {
  network: string;
  type: 'first_empty' | 'full_path' | 'index' | 'client';
  full_path?: string;
  index?: number;
}

export interface SendNanoContractTxParams {
  method: string;
  blueprint_id?: string;
  nc_id?: string;
  actions: NanoContractAction[];
  args: any[];
  push_tx: boolean;
}

export interface NanoContractAction {
  type: 'deposit' | 'withdrawal';
  amount: string;
  token: string;
  address?: string;
  changeAddress?: string;
}
