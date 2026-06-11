'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AgentStatus,
  PLAYGROUND_ENDPOINTS,
  PlaygroundEndpoint,
  formatHTR,
  generateMockAddress,
  generateMockTxId,
  shortAddress,
  shortHash,
} from '@/lib/playground/mock';

// --- types -----------------------------------------------------------------

export type FlowStepState = 'active' | 'done' | 'error';

export interface FlowStep {
  id: string;
  label: string;
  detail: string;
  state: FlowStepState;
  ms?: number;
}

export interface PlaygroundResponse {
  ok: boolean;
  statusLabel: string; // '200 OK' | '402 Payment Required' | 'BLOCKED'
  totalMs: number;
  priceCents: number | null;
  body: unknown;
}

export interface TxLogEntry {
  txId: string;
  route: string;
  amountCents: number;
}

export interface SpendEntry {
  route: string;
  amountCents: number;
}

interface PlaygroundContextValue {
  // agent config
  walletAddress: string;
  regenerateWallet: () => void;
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
  runCounter: number; // increments when a run finishes (tour uses this)

  // flow + response + log
  flowSteps: FlowStep[];
  response: PlaygroundResponse | null;
  txLog: TxLogEntry[];

  // guided tour
  tourIndex: number | null;
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  exitTour: () => void;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

// --- helpers ---------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));

// --- provider ----------------------------------------------------------------

export function PlaygroundProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState(() => generateMockAddress());
  const [status, setStatus] = useState<AgentStatus>('active');
  const [maxPerTxCents, setMaxPerTxCents] = useState(50); // 0.50 HTR
  const [maxPerDayCents, setMaxPerDayCents] = useState(500); // 5.00 HTR

  const [spentCents, setSpentCents] = useState(0);
  const [spendEntries, setSpendEntries] = useState<SpendEntry[]>([]);

  const [selectedId, setSelectedId] = useState(PLAYGROUND_ENDPOINTS[0].id);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runCounter, setRunCounter] = useState(0);

  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [txLog, setTxLog] = useState<TxLogEntry[]>([]);

  const [tourIndex, setTourIndex] = useState<number | null>(null);

  const runningRef = useRef(false);
  // Read latest config inside the async engine without re-creating it.
  const configRef = useRef({ status, maxPerTxCents, maxPerDayCents, spentCents, walletAddress });
  configRef.current = { status, maxPerTxCents, maxPerDayCents, spentCents, walletAddress };

  const regenerateWallet = useCallback(() => {
    setWalletAddress(generateMockAddress());
  }, []);

  const runRequest = useCallback(async () => {
    if (runningRef.current) return;
    const endpoint = PLAYGROUND_ENDPOINTS.find((e) => e.id === selectedId);
    if (!endpoint) return;

    runningRef.current = true;
    setIsExecuting(true);
    setResponse(null);

    const steps: FlowStep[] = [];
    const sync = () => setFlowSteps([...steps]);
    setFlowSteps([]);

    const started = Date.now();
    const price = formatHTR(endpoint.priceCents);
    const cfg = () => configRef.current;

    // Runs one flow step: shows it as active, waits a simulated latency,
    // then marks it done (or error, which also ends the whole run).
    const step = async (
      id: string,
      label: string,
      detail: string,
      opts: { minMs?: number; maxMs?: number; error?: boolean } = {}
    ) => {
      const entry: FlowStep = { id, label, detail, state: 'active' };
      steps.push(entry);
      sync();
      const ms = jitter(opts.minMs ?? 150, opts.maxMs ?? 420);
      await sleep(ms);
      entry.state = opts.error ? 'error' : 'done';
      entry.ms = ms;
      sync();
    };

    const finish = (resp: PlaygroundResponse) => {
      setResponse(resp);
      setIsExecuting(false);
      runningRef.current = false;
      setRunCounter((c) => c + 1);
    };

    try {
      await step('send', 'Sending Request', `GET ${endpoint.path}`);
      await step(
        '402',
        'Payment Required',
        `402 — ${price} HTR on Hathor Testnet`,
        { minMs: 200, maxMs: 380 }
      );

      // Agent-side spending policies are checked BEFORE signing anything.
      if (endpoint.priceCents > cfg().maxPerTxCents) {
        await step(
          'policy',
          'Policy Check Failed',
          `Agent refused — ${price} HTR exceeds max per transaction (${formatHTR(cfg().maxPerTxCents)} HTR)`,
          { error: true, minMs: 120, maxMs: 250 }
        );
        finish({
          ok: false,
          statusLabel: 'BLOCKED',
          totalMs: Date.now() - started,
          priceCents: null,
          body: {
            error: 'spending_policy_violation',
            reason: `Payment of ${price} HTR exceeds maxPerTransaction (${formatHTR(cfg().maxPerTxCents)} HTR)`,
            policy: 'maxPerTransaction',
            signed: false,
          },
        });
        return;
      }

      if (cfg().spentCents + endpoint.priceCents > cfg().maxPerDayCents) {
        await step(
          'policy',
          'Policy Check Failed',
          `Agent refused — daily budget exhausted (${formatHTR(cfg().spentCents)} / ${formatHTR(cfg().maxPerDayCents)} HTR spent)`,
          { error: true, minMs: 120, maxMs: 250 }
        );
        finish({
          ok: false,
          statusLabel: 'BLOCKED',
          totalMs: Date.now() - started,
          priceCents: null,
          body: {
            error: 'spending_policy_violation',
            reason: `Payment of ${price} HTR would exceed maxPerDay (${formatHTR(cfg().maxPerDayCents)} HTR)`,
            policy: 'maxPerDay',
            spent_today: formatHTR(cfg().spentCents),
            signed: false,
          },
        });
        return;
      }

      await step(
        'sign',
        'Signing Payment',
        `Wallet ${shortAddress(cfg().walletAddress)} authorizing ${price} HTR`,
        { minMs: 250, maxMs: 450 }
      );

      // Paused/revoked agents are rejected facilitator-side during verification.
      if (cfg().status !== 'active') {
        await step(
          'verify',
          'Verification Failed',
          `Facilitator rejected payment — agent is ${cfg().status}`,
          { error: true, minMs: 200, maxMs: 350 }
        );
        finish({
          ok: false,
          statusLabel: '403 Forbidden',
          totalMs: Date.now() - started,
          priceCents: null,
          body: {
            error: 'agent_not_active',
            reason: `Payment rejected by facilitator: agent status is '${cfg().status}'`,
            agent: cfg().walletAddress,
          },
        });
        return;
      }

      await step(
        'verify',
        'Verifying Signature',
        'Facilitator validating payment proof...',
        { minMs: 180, maxMs: 320 }
      );

      const txId = generateMockTxId();
      await step('settle', 'Payment Settled', `tx ${shortHash(txId)}`, {
        minMs: 250,
        maxMs: 400,
      });

      const body = endpoint.mockBody();
      const bytes = JSON.stringify(body).length;
      await step(
        'data',
        'Data Received',
        `${bytes} bytes — ${endpoint.description}`,
        { minMs: 120, maxMs: 220 }
      );

      setSpentCents((s) => s + endpoint.priceCents);
      setSpendEntries((prev) => [
        ...prev,
        { route: endpoint.path, amountCents: endpoint.priceCents },
      ]);
      setTxLog((prev) => [
        ...prev,
        { txId, route: endpoint.path, amountCents: endpoint.priceCents },
      ]);

      finish({
        ok: true,
        statusLabel: '200 OK',
        totalMs: Date.now() - started,
        priceCents: endpoint.priceCents,
        body,
      });
    } catch {
      // The engine is fully local; the only realistic failure is a bug.
      setIsExecuting(false);
      runningRef.current = false;
    }
  }, [selectedId]);

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
      regenerateWallet,
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
      txLog,
      tourIndex,
      startTour,
      nextTourStep,
      prevTourStep,
      exitTour,
    }),
    [
      walletAddress,
      regenerateWallet,
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
      txLog,
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
