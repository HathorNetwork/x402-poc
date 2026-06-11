'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AgentStatus,
  PLAYGROUND_ENDPOINTS,
  PlaygroundEndpoint,
  TOKEN_SYMBOL,
  formatAmount,
  shortAddress,
  shortHash,
} from '@/lib/playground/mock';
import {
  WalletStateError,
  ensureSession,
  fetchBalance,
} from '@/lib/playground/session';
import {
  X402Accept,
  buildPaymentSignatureHeader,
  decodePaymentResponse,
  fetch402,
} from '@/lib/playground/x402';
import { config } from '@/lib/config';

// --- types -----------------------------------------------------------------

export type FlowStepState = 'active' | 'done' | 'error';

export interface FlowStep {
  id: string;
  label: string;
  detail: string;
  state: FlowStepState;
}

export interface PlaygroundResponse {
  ok: boolean;
  statusLabel: string; // '200 OK' | '402 Payment Required' | 'BLOCKED' | ...
  priceCents: number | null; // hUSDC atomic units
  txId: string | null;
  body: unknown;
}

export interface SpendEntry {
  route: string;
  amountCents: number; // hUSDC atomic units
  txId: string;
}

export type SessionState = 'wallet-loading' | 'wallet-error' | 'ready';

interface PlaygroundContextValue {
  // agent config + session
  walletAddress: string;
  sessionState: SessionState;
  sessionDetail: string | null;
  retrySession: () => void;
  balanceAtomic: number | null;
  status: AgentStatus;
  setStatus: (s: AgentStatus) => void;
  maxPerTxCents: number;
  setMaxPerTxCents: (cents: number) => void;
  maxPerDayCents: number;
  setMaxPerDayCents: (cents: number) => void;

  // spend tracker
  spentCents: number;
  spendEntries: SpendEntry[];

  // endpoints + request engine
  endpoints: PlaygroundEndpoint[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  isExecuting: boolean;
  runRequest: () => Promise<void>;
  runCounter: number;

  // flow + response
  flowSteps: FlowStep[];
  response: PlaygroundResponse | null;

  // guided tour
  tourIndex: number | null;
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  exitTour: () => void;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

// Per-address persistence of the executed-payments list, so a refresh keeps
// the Spend Tracker history alongside the (already persisted) address.
const SPEND_STORAGE_KEY = 'x402_playground_spend_v1';

function loadSpendEntries(address: string): SpendEntry[] {
  try {
    const raw = localStorage.getItem(SPEND_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.address === address && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch {
    /* corrupted — start fresh */
  }
  return [];
}

function saveSpendEntries(address: string, entries: SpendEntry[]): void {
  try {
    localStorage.setItem(SPEND_STORAGE_KEY, JSON.stringify({ address, entries }));
  } catch {
    /* storage full/blocked — history just won't survive refresh */
  }
}

// Error that carries how the run should be reported in the Task result panel.
class RunError extends Error {
  statusLabel: string;
  body: unknown;
  constructor(message: string, statusLabel: string, body?: unknown) {
    super(message);
    this.statusLabel = statusLabel;
    this.body = body ?? { error: message };
  }
}

// --- provider ----------------------------------------------------------------

export function PlaygroundProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [sessionState, setSessionState] = useState<SessionState>('wallet-loading');
  const [sessionDetail, setSessionDetail] = useState<string | null>(null);
  const [balanceAtomic, setBalanceAtomic] = useState<number | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  const [status, setStatus] = useState<AgentStatus>('active');
  const [maxPerTxCents, setMaxPerTxCents] = useState(50); // 0.50 hUSDC
  const [maxPerDayCents, setMaxPerDayCents] = useState(500); // 5.00 hUSDC

  const [spentCents, setSpentCents] = useState(0);
  const [spendEntries, setSpendEntries] = useState<SpendEntry[]>([]);

  const [selectedId, setSelectedId] = useState(PLAYGROUND_ENDPOINTS[0].id);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runCounter, setRunCounter] = useState(0);

  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);

  const [tourIndex, setTourIndex] = useState<number | null>(null);

  const runningRef = useRef(false);
  const configRef = useRef({ status, maxPerTxCents, maxPerDayCents, spentCents, walletAddress });
  configRef.current = { status, maxPerTxCents, maxPerDayCents, spentCents, walletAddress };

  // --- session bootstrap -----------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const bootstrap = async () => {
      try {
        const { session, balanceAtomic: bal } = await ensureSession();
        if (cancelled) return;
        setWalletAddress(session.address);
        setBalanceAtomic(bal);
        const storedEntries = loadSpendEntries(session.address);
        setSpendEntries(storedEntries);
        setSpentCents(storedEntries.reduce((sum, e) => sum + e.amountCents, 0));
        setSessionState('ready');
        setSessionDetail(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof WalletStateError && err.state === 'loading') {
          setSessionState('wallet-loading');
          setSessionDetail(err.message);
          timer = setTimeout(bootstrap, 3000); // poll until the wallet is ready
        } else {
          setSessionState('wallet-error');
          setSessionDetail((err as Error).message);
        }
      }
    };

    setSessionState('wallet-loading');
    void bootstrap();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionAttempt]);

  const retrySession = useCallback(() => setSessionAttempt((n) => n + 1), []);

  const refreshBalance = useCallback(async () => {
    const addr = configRef.current.walletAddress;
    if (!addr) return;
    try {
      setBalanceAtomic(await fetchBalance(addr));
    } catch {
      /* keep last known balance */
    }
  }, []);

  // --- request engine ----------------------------------------------------------

  const runRequest = useCallback(async () => {
    if (runningRef.current || sessionState !== 'ready') return;
    const endpoint = PLAYGROUND_ENDPOINTS.find((e) => e.id === selectedId);
    if (!endpoint) return;

    runningRef.current = true;
    setIsExecuting(true);
    setResponse(null);

    const steps: FlowStep[] = [];
    const sync = () => setFlowSteps([...steps]);
    setFlowSteps([]);

    const url = `${config.resourceServerUrl}${endpoint.path}`;
    const cfg = () => configRef.current;

    // Some real operations resolve in single-digit ms; pad every step to a
    // minimum visible duration so the flow reads as a sequence, not a blink.
    const MIN_STEP_MS = 450;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const runStep = async <T,>(
      id: string,
      label: string,
      detail: string,
      fn: (setDetail: (d: string) => void) => Promise<T>
    ): Promise<T> => {
      const entry: FlowStep = { id, label, detail, state: 'active' };
      steps.push(entry);
      sync();
      const t0 = performance.now();
      try {
        const out = await fn((d) => {
          entry.detail = d;
          sync();
        });
        const elapsed = performance.now() - t0;
        if (elapsed < MIN_STEP_MS) await sleep(MIN_STEP_MS - elapsed);
        entry.state = 'done';
        sync();
        return out;
      } catch (err) {
        entry.state = 'error';
        entry.detail = (err as Error).message;
        sync();
        throw err;
      }
    };

    // Pushes an immediately-failed policy step (no real operation behind it).
    const policyRefusal = (detail: string, body: unknown): never => {
      steps.push({ id: 'policy', label: 'Policy Check Failed', detail, state: 'error' });
      sync();
      throw new RunError(detail, 'BLOCKED', body);
    };

    let txId: string | null = null;

    const finish = (resp: PlaygroundResponse) => {
      setResponse(resp);
      setIsExecuting(false);
      runningRef.current = false;
      setRunCounter((c) => c + 1);
    };

    try {
      // 1. Initial request → expect the 402 challenge
      const accept = await runStep<X402Accept>(
        'send',
        'Sending Request',
        `GET ${endpoint.path}`,
        async () => {
          try {
            return await fetch402(url);
          } catch (err) {
            throw new RunError((err as Error).message, 'NETWORK ERROR');
          }
        }
      );

      const amount = parseInt(accept.amount, 10);
      await runStep('402', 'Payment Required', '', async (setDetail) => {
        if (accept.scheme !== 'hathor-direct') {
          throw new RunError(`Unsupported scheme ${accept.scheme}`, 'UNSUPPORTED');
        }
        setDetail(`402 — ${formatAmount(amount)} ${TOKEN_SYMBOL} on Hathor Testnet`);
      });

      // 2. Agent-side spending policies — checked BEFORE any transaction.
      if (cfg().status !== 'active') {
        policyRefusal(`Agent is ${cfg().status} — refused to pay`, {
          error: 'agent_not_active',
          reason: `Agent status is '${cfg().status}' — no payment was signed`,
          signed: false,
        });
      }
      if (amount > cfg().maxPerTxCents) {
        policyRefusal(
          `Agent refused — ${formatAmount(amount)} ${TOKEN_SYMBOL} exceeds max per transaction (${formatAmount(cfg().maxPerTxCents)} ${TOKEN_SYMBOL})`,
          {
            error: 'spending_policy_violation',
            reason: `Payment of ${formatAmount(amount)} ${TOKEN_SYMBOL} exceeds maxPerTransaction (${formatAmount(cfg().maxPerTxCents)} ${TOKEN_SYMBOL})`,
            policy: 'maxPerTransaction',
            signed: false,
          }
        );
      }
      if (cfg().spentCents + amount > cfg().maxPerDayCents) {
        policyRefusal(
          `Agent refused — daily budget exhausted (${formatAmount(cfg().spentCents)} / ${formatAmount(cfg().maxPerDayCents)} ${TOKEN_SYMBOL} spent)`,
          {
            error: 'spending_policy_violation',
            reason: `Payment of ${formatAmount(amount)} ${TOKEN_SYMBOL} would exceed maxPerDay (${formatAmount(cfg().maxPerDayCents)} ${TOKEN_SYMBOL})`,
            policy: 'maxPerDay',
            spent_today: formatAmount(cfg().spentCents),
            signed: false,
          }
        );
      }

      // 3. Pay on-chain (the slow part — tx mining PoW + broadcast)
      await runStep(
        'pay',
        'Sending Payment',
        `Wallet ${shortAddress(cfg().walletAddress)} paying ${formatAmount(amount)} ${TOKEN_SYMBOL}`,
        async (setDetail) => {
          const payResp = await fetch('/api/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: cfg().walletAddress,
              payTo: accept.payTo,
              amountAtomic: amount,
              token: accept.asset,
            }),
          });
          if (!payResp.ok) {
            const eb = await payResp.json().catch(() => ({}) as any);
            if (payResp.status === 409) {
              throw new RunError(`Insufficient ${TOKEN_SYMBOL} balance`, 'BLOCKED', {
                error: 'insufficient_funds',
                reason: eb.detail || `Not enough ${TOKEN_SYMBOL} at the agent's address`,
              });
            }
            throw new RunError(
              eb.detail || 'Wallet service unavailable',
              'WALLET ERROR',
              eb
            );
          }
          txId = (await payResp.json()).txId as string;
          setDetail(`Paid ${formatAmount(amount)} ${TOKEN_SYMBOL} — tx ${shortHash(txId)}`);
        }
      );

      // 4. Sign the requestId with the paying address (payment proof)
      const signatures = await runStep<{ address: string; signature: string }[]>(
        'sign',
        'Signing Payment',
        `Wallet ${shortAddress(cfg().walletAddress)} signing the payment proof`,
        async () => {
          const signResp = await fetch('/api/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txId, requestId: accept.extra.requestId }),
          });
          if (!signResp.ok) {
            const eb = await signResp.json().catch(() => ({}) as any);
            throw new RunError(
              eb.detail || 'Failed to sign payment proof',
              'WALLET ERROR',
              eb
            );
          }
          return (await signResp.json()).signatures;
        }
      );

      // 5. Resubmit with the payment proof
      const paidResp = await runStep<Response>(
        'verify',
        'Verifying Signature',
        'Facilitator validating payment proof...',
        async () => {
          const header = buildPaymentSignatureHeader({
            scheme: accept.scheme,
            network: accept.network,
            txId: txId!,
            signatures,
            requestId: accept.extra.requestId,
          });
          const r = await fetch(url, {
            headers: { 'PAYMENT-SIGNATURE': header },
            cache: 'no-store',
          });
          if (!r.ok) {
            const eb = await r.json().catch(() => ({}) as any);
            throw new RunError(
              eb.reason || eb.error || `Rejected with HTTP ${r.status}`,
              r.status === 402 ? '402 Payment Required' : `${r.status} ERROR`,
              eb
            );
          }
          return r;
        }
      );

      const paidBody = await paidResp.json();
      await runStep('settle', 'Payment Settled', '', async (setDetail) => {
        const pr =
          decodePaymentResponse(paidResp.headers.get('PAYMENT-RESPONSE')) ||
          paidBody?.payment;
        const settledTx = pr?.transaction || txId!;
        setDetail(`tx ${shortHash(settledTx)}`);
      });

      const data = paidBody?.data ?? paidBody;
      await runStep('data', 'Data Received', '', async (setDetail) => {
        const bytes = JSON.stringify(data).length;
        setDetail(`${bytes} bytes — ${endpoint.description}`);
      });

      setSpentCents((s) => s + amount);
      setSpendEntries((prev) => {
        const next = [...prev, { route: endpoint.path, amountCents: amount, txId: txId! }];
        saveSpendEntries(cfg().walletAddress, next);
        return next;
      });
      void refreshBalance();

      finish({
        ok: true,
        statusLabel: '200 OK',
        priceCents: amount,
        txId,
        body: data,
      });
    } catch (err) {
      // A tx may have been broadcast before the failure — reflect the real balance.
      if (txId) void refreshBalance();
      const run = err instanceof RunError ? err : null;
      finish({
        ok: false,
        statusLabel: run?.statusLabel || 'ERROR',
        priceCents: null,
        txId,
        body: run?.body ?? { error: (err as Error).message },
      });
    }
  }, [selectedId, sessionState, refreshBalance]);

  // --- tour ------------------------------------------------------------------

  const startTour = useCallback(() => setTourIndex(0), []);
  const exitTour = useCallback(() => setTourIndex(null), []);
  const nextTourStep = useCallback(
    () => setTourIndex((i) => (i === null ? null : i + 1)),
    []
  );
  const prevTourStep = useCallback(
    () => setTourIndex((i) => (i === null || i === 0 ? i : i - 1)),
    []
  );

  const value = useMemo<PlaygroundContextValue>(
    () => ({
      walletAddress,
      sessionState,
      sessionDetail,
      retrySession,
      balanceAtomic,
      status,
      setStatus,
      maxPerTxCents,
      setMaxPerTxCents,
      maxPerDayCents,
      setMaxPerDayCents,
      spentCents,
      spendEntries,
      endpoints: PLAYGROUND_ENDPOINTS,
      selectedId,
      setSelectedId,
      isExecuting,
      runRequest,
      runCounter,
      flowSteps,
      response,
      tourIndex,
      startTour,
      nextTourStep,
      prevTourStep,
      exitTour,
    }),
    [
      walletAddress,
      sessionState,
      sessionDetail,
      retrySession,
      balanceAtomic,
      status,
      maxPerTxCents,
      maxPerDayCents,
      spentCents,
      spendEntries,
      selectedId,
      isExecuting,
      runRequest,
      runCounter,
      flowSteps,
      response,
      tourIndex,
      startTour,
      nextTourStep,
      prevTourStep,
      exitTour,
    ]
  );

  return (
    <PlaygroundContext.Provider value={value}>
      {children}
    </PlaygroundContext.Provider>
  );
}

export function usePlayground(): PlaygroundContextValue {
  const ctx = useContext(PlaygroundContext);
  if (!ctx) throw new Error('usePlayground must be used inside PlaygroundProvider');
  return ctx;
}
