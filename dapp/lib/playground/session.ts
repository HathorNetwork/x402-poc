// Client-side session: one funded wallet address per browser, persisted in
// localStorage. All wallet operations go through the dapp's /api/* proxy.

export interface PlaygroundSession {
  address: string;
  fundTxId: string;
}

export interface SessionResult {
  session: PlaygroundSession;
  balanceAtomic: number;
}

const STORAGE_KEY = 'x402_playground_session_v1';

export class WalletStateError extends Error {
  state: 'loading' | 'error';
  constructor(state: 'loading' | 'error', message: string) {
    super(message);
    this.state = state;
  }
}

function readStored(): PlaygroundSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.address === 'string') return parsed;
  } catch {
    /* corrupted — reallocate */
  }
  return null;
}

async function throwWalletState(resp: Response): Promise<never> {
  const body = await resp.json().catch(() => ({}));
  if (body?.error === 'wallet_loading') {
    throw new WalletStateError('loading', body.detail || 'Wallet is loading');
  }
  throw new WalletStateError(
    'error',
    body?.detail || body?.error || `Wallet service error (${resp.status})`
  );
}

export async function fetchBalance(address: string): Promise<number> {
  const resp = await fetch(
    `/api/session/balance?address=${encodeURIComponent(address)}`,
    { cache: 'no-store' }
  );
  if (resp.status === 404) {
    // Address unknown to the wallet (e.g. headless seed changed) — reallocate.
    localStorage.removeItem(STORAGE_KEY);
    throw new WalletStateError('error', 'Stored address unknown — reload to reallocate');
  }
  if (!resp.ok) await throwWalletState(resp);
  const body = await resp.json();
  return Number(body.balanceAtomic ?? 0);
}

async function allocate(): Promise<SessionResult> {
  const resp = await fetch('/api/session', { method: 'POST' });
  if (!resp.ok) await throwWalletState(resp);
  const body = await resp.json();
  const session: PlaygroundSession = {
    address: body.address,
    fundTxId: body.fundTxId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return { session, balanceAtomic: Number(body.balanceAtomic ?? 0) };
}

// Module-level singleton so React StrictMode double-mounts (and any concurrent
// callers) share one allocation instead of funding two addresses.
let inFlight: Promise<SessionResult> | null = null;

export function ensureSession(): Promise<SessionResult> {
  if (!inFlight) {
    inFlight = (async () => {
      const stored = readStored();
      if (stored) {
        try {
          const balanceAtomic = await fetchBalance(stored.address);
          return { session: stored, balanceAtomic };
        } catch (err) {
          if (err instanceof WalletStateError && err.state === 'loading') throw err;
          // unknown_address already cleared storage — fall through to allocate
          if (readStored()) throw err;
        }
      }
      return allocate();
    })();
    // Allow retry after failures (e.g. wallet still loading).
    inFlight.catch(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
