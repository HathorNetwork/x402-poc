'use client';

import { useEffect, useState } from 'react';
import { usePlayground } from '@/contexts/PlaygroundContext';
import { AgentStatus, TOKEN_SYMBOL, formatAmount } from '@/lib/playground/mock';

const STATUS_COLORS: Record<AgentStatus, string> = {
  active: 'text-green-400 border-green-500/40',
  paused: 'text-amber-400 border-amber-500/40',
  revoked: 'text-red-400 border-red-500/40',
};

function AmountInput({
  label,
  cents,
  onChangeCents,
}: {
  label: string;
  cents: number;
  onChangeCents: (cents: number) => void;
}) {
  const [text, setText] = useState(formatAmount(cents));

  // Keep the input in sync if the value changes from outside.
  useEffect(() => {
    setText(formatAmount(cents));
  }, [cents]);

  const commit = () => {
    const parsed = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChangeCents(Math.round(parsed * 100));
    } else {
      setText(formatAmount(cents));
    }
  };

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      <div className="flex items-center bg-slate-700 border border-slate-600 rounded-lg overflow-hidden focus-within:border-amber-500 transition-colors">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none min-w-0"
        />
        <span className="px-3 text-xs text-slate-400 select-none">
          {TOKEN_SYMBOL}
        </span>
      </div>
    </div>
  );
}

export function AgentConfigCard() {
  const {
    walletAddress,
    sessionState,
    sessionDetail,
    retrySession,
    status,
    setStatus,
    maxPerTxCents,
    setMaxPerTxCents,
    maxPerDayCents,
    setMaxPerDayCents,
  } = usePlayground();

  return (
    <div
      data-tour="config"
      className="bg-slate-800 rounded-xl border border-slate-700 p-5"
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-lg font-bold text-white">Agent Configuration</h3>
        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          Live Testnet
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        On-chain identity and spending guardrails
      </p>

      <label className="block text-xs text-slate-400 mb-1.5">Wallet Address</label>
      {sessionState === 'wallet-error' ? (
        <div className="mb-4">
          <div className="flex items-center justify-between bg-slate-700 border border-red-500/50 rounded-lg px-3 py-2">
            <span className="text-sm text-red-400">Wallet error</span>
            <button
              onClick={retrySession}
              className="text-xs px-2 py-1 rounded border border-slate-500 text-slate-300 hover:text-white hover:border-slate-300 transition-colors"
            >
              Retry
            </button>
          </div>
          {sessionDetail && (
            <p className="text-xs text-red-400/70 mt-1 break-words">{sessionDetail}</p>
          )}
        </div>
      ) : (
        <input
          type="text"
          readOnly
          value={sessionState === 'ready' ? walletAddress : 'Loading wallet...'}
          className={`w-full mb-4 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono truncate ${
            sessionState === 'ready' ? 'text-white' : 'text-slate-400 animate-pulse'
          }`}
        />
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Chain</label>
          <select
            disabled
            value="hathor-testnet"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white appearance-none"
          >
            <option value="hathor-testnet">Hathor Testnet</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Agent Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AgentStatus)}
            className={`w-full bg-slate-700 border rounded-lg px-3 py-2 text-sm appearance-none ${STATUS_COLORS[status]}`}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>

      <div data-tour="policies" className="grid grid-cols-2 gap-3 rounded-lg">
        <AmountInput
          label="Max per Transaction"
          cents={maxPerTxCents}
          onChangeCents={setMaxPerTxCents}
        />
        <AmountInput
          label="Max per Day"
          cents={maxPerDayCents}
          onChangeCents={setMaxPerDayCents}
        />
      </div>
    </div>
  );
}
