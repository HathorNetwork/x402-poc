// dApp types for x402 hathor-direct flow. No nano-contract types — those went
// away with the blueprint redesign.

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

// --- htr_sendTransaction -----------------------------------------------------

export interface SendTransactionOutput {
  address?: string;
  // The RPC schema requires a digit string (z.string().regex(/^\d+$/)),
  // not a number — see hathor-rpc-handler/src/rpcMethods/sendTransaction.ts:59.
  value?: string;
  token?: string;
  timelock?: number;
  // OP_RETURN-style data output (we don't use this for hathor-direct but the
  // RPC supports it).
  type?: 'data';
  data?: string;
}

export interface SendTransactionInput {
  txId: string;
  index: number;
}

export interface SendTransactionParams {
  network: string;
  outputs: SendTransactionOutput[];
  inputs?: SendTransactionInput[];
  changeAddress?: string;
  push_tx: boolean;
}

// The RPC's response shape varies a bit across wallets (some return a flat
// `hash`, some wrap in `response: { hash }`). We type the union and the
// service helper picks the right field.
export interface SendTransactionResponse {
  hash?: string;
  txId?: string;
  response?: {
    hash?: string;
    response?: { hash?: string };
  };
  success?: boolean;
}

// --- htr_getUtxos ------------------------------------------------------------

export interface GetUtxosParams {
  network: string;
  maxUtxos?: number;
  token?: string;
  filterAddress?: string;
  authorities?: number;
  amountSmallerThan?: number;
  amountBiggerThan?: number;
  maximumAmount?: number;
  onlyAvailableUtxos?: boolean;
}

export interface UtxoInfo {
  address: string;
  amount: string | number | bigint;
  tx_id: string;
  index: number;
  locked: boolean;
}

export interface UtxoDetails {
  total_amount_available: string | number | bigint;
  total_utxos_available: string | number | bigint;
  total_amount_locked: string | number | bigint;
  total_utxos_locked: string | number | bigint;
  utxos: UtxoInfo[];
}

// --- htr_signWithAddress -----------------------------------------------------

export interface SignWithAddressParams {
  network: string;
  message: string;
  addressIndex: number;
}

export interface SignWithAddressResponse {
  message: string;
  signature: string;
  address: {
    address: string;
    index: number;
    addressPath: string;
  };
}
