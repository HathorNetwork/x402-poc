// Server-side client for hathor-wallet-headless. Param names verified against
// a live headless: GET /wallet/address?mark_as_used=true advances addresses;
// POST /wallet/send-tx understands inputs:[{type:'query', filter_address}] and
// change_address (snake_case — camelCase variants are SILENTLY IGNORED, which
// would spend/leak treasury UTXOs, so never "fix" the casing here).

import { NextResponse } from 'next/server';
import { serverEnv } from './env';

export type HeadlessErrorCode =
  | 'headless_unreachable'
  | 'wallet_not_ready'
  | 'wallet_not_started'
  | 'insufficient_funds'
  | 'unknown_address'
  | 'headless_error';

export class HeadlessError extends Error {
  code: HeadlessErrorCode;
  constructor(code: HeadlessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${serverEnv.headlessUrl}${path}`, {
      ...init,
      headers: {
        'X-Wallet-Id': serverEnv.walletId,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new HeadlessError(
      'headless_unreachable',
      `Headless wallet unreachable at ${serverEnv.headlessUrl}: ${(err as Error).message}`
    );
  }
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    throw new HeadlessError(
      'headless_error',
      `Headless returned non-JSON (HTTP ${resp.status}) for ${path}`
    );
  }
  return body as T;
}

interface StatusResponse {
  statusCode?: number;
  statusMessage?: string;
  network?: string;
  success?: boolean;
  message?: string;
}

export type WalletState = 'ready' | 'loading' | 'error';

// Auto-start (used in the compose deployment): when HEADLESS_SEED is set and
// the headless reports the wallet as not started, POST /start once and report
// 'loading' while it syncs. Deduped so concurrent status checks fire one start.
let startInFlight: Promise<void> | null = null;

function startWallet(): void {
  if (startInFlight) return;
  startInFlight = call<{ success?: boolean; message?: string }>(
    '/start',
    {
      method: 'POST',
      body: JSON.stringify({
        'wallet-id': serverEnv.walletId,
        seed: serverEnv.walletSeed,
      }),
    },
    30000
  )
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      // Allow a re-attempt on the next status check if this one failed.
      startInFlight = null;
    });
}

// Distinguishes "headless up but wallet still starting/syncing" (loading)
// from "unreachable / wallet not started" (error).
export async function getWalletState(): Promise<{ state: WalletState; detail?: string }> {
  let status: StatusResponse;
  try {
    status = await call<StatusResponse>('/wallet/status', {}, 8000);
  } catch (err) {
    return { state: 'error', detail: (err as HeadlessError).message };
  }
  if (status.statusCode === 3) return { state: 'ready' };
  if (typeof status.statusCode === 'number') {
    return { state: 'loading', detail: status.statusMessage || 'Wallet syncing' };
  }
  // No statusCode — typically {success:false, message:'Invalid wallet id'},
  // i.e. the wallet was never started on this headless instance.
  if (serverEnv.walletSeed) {
    startWallet();
    return { state: 'loading', detail: 'Starting wallet...' };
  }
  return {
    state: 'error',
    detail: status.message || `Wallet '${serverEnv.walletId}' not started on headless`,
  };
}

export async function assertWalletReady(): Promise<void> {
  const { state, detail } = await getWalletState();
  if (state === 'ready') return;
  if (state === 'loading') {
    throw new HeadlessError('wallet_not_ready', detail || 'Wallet still syncing');
  }
  throw new HeadlessError('wallet_not_started', detail || 'Wallet not available');
}

export async function getNewAddress(): Promise<string> {
  const resp = await call<{ address?: string }>('/wallet/address?mark_as_used=true');
  if (!resp.address) {
    throw new HeadlessError('headless_error', 'Headless did not return an address');
  }
  return resp.address;
}

export async function getAddressBalance(address: string): Promise<number> {
  const resp = await call<{
    success?: boolean;
    total_amount_available?: number;
    error?: string;
    message?: string;
  }>(
    `/wallet/address-info?address=${encodeURIComponent(address)}&token=${serverEnv.tokenUid}`
  );
  if (!resp.success) {
    const reason = resp.error || resp.message || 'address-info failed';
    if (/does not belong|not found|invalid address/i.test(reason)) {
      throw new HeadlessError('unknown_address', reason);
    }
    throw new HeadlessError('headless_error', reason);
  }
  return Number(resp.total_amount_available ?? 0);
}

export async function sendTx(params: {
  toAddress: string;
  amountAtomic: number;
  fromAddress: string; // inputs filtered to this address; change returns here too
  changeAddress?: string;
}): Promise<string> {
  const body = {
    outputs: [
      {
        address: params.toAddress,
        value: params.amountAtomic,
        token: serverEnv.tokenUid,
      },
    ],
    inputs: [{ type: 'query', filter_address: params.fromAddress }],
    change_address: params.changeAddress || params.fromAddress,
  };
  const resp = await call<{ success?: boolean; hash?: string; error?: string }>(
    '/wallet/send-tx',
    { method: 'POST', body: JSON.stringify(body) },
    60000 // tx mining PoW can be slow
  );
  if (!resp.success || !resp.hash) {
    const reason = resp.error || 'send-tx failed';
    if (/no utxos|insufficient|not enough/i.test(reason)) {
      throw new HeadlessError('insufficient_funds', reason);
    }
    throw new HeadlessError('headless_error', reason);
  }
  return resp.hash;
}

export async function getTransactionInputAddresses(txId: string): Promise<string[]> {
  const fetchOnce = async () => {
    const resp = await call<{
      success?: boolean;
      inputs?: { decoded?: { address?: string } }[];
    }>(`/wallet/transaction?id=${encodeURIComponent(txId)}`);
    const inputs = resp.inputs || [];
    const addrs = [
      ...new Set(
        inputs.map((i) => i.decoded?.address).filter((a): a is string => !!a)
      ),
    ];
    return addrs;
  };
  let addrs = await fetchOnce();
  if (addrs.length === 0) {
    // Headless may not have indexed the tx yet — retry once after 2s.
    await new Promise((r) => setTimeout(r, 2000));
    addrs = await fetchOnce();
  }
  if (addrs.length === 0) {
    throw new HeadlessError('headless_error', `Transaction ${txId} not found in wallet`);
  }
  return addrs;
}

export async function signMessage(
  message: string,
  address: string
): Promise<{ address: string; signature: string }> {
  const resp = await call<{
    success?: boolean;
    signature?: string;
    address?: string;
    error?: string;
    message?: string;
  }>('/wallet/sign-message', {
    method: 'POST',
    body: JSON.stringify({ message, address }),
  });
  if (!resp.success || !resp.signature) {
    throw new HeadlessError(
      'headless_error',
      resp.error || resp.message || 'sign-message failed (headless too old?)'
    );
  }
  return { address: resp.address || address, signature: resp.signature };
}

// Shared error → HTTP response mapping for all proxy routes.
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof HeadlessError) {
    switch (err.code) {
      case 'wallet_not_ready':
        return NextResponse.json(
          { error: 'wallet_loading', detail: err.message },
          { status: 503 }
        );
      case 'headless_unreachable':
      case 'wallet_not_started':
        return NextResponse.json(
          { error: 'wallet_error', detail: err.message },
          { status: 503 }
        );
      case 'insufficient_funds':
        return NextResponse.json(
          { error: 'insufficient_funds', detail: err.message },
          { status: 409 }
        );
      case 'unknown_address':
        return NextResponse.json(
          { error: 'unknown_address', detail: err.message },
          { status: 404 }
        );
      default:
        return NextResponse.json(
          { error: 'headless_error', detail: err.message },
          { status: 502 }
        );
    }
  }
  return NextResponse.json(
    { error: 'internal_error', detail: (err as Error)?.message || 'unknown' },
    { status: 500 }
  );
}

export const HATHOR_ADDRESS_RE = /^W[1-9A-HJ-NP-Za-km-z]{33}$/;
