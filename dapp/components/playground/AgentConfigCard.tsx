'use client';

import { useEffect, useState } from 'react';
import { usePlayground } from '@/contexts/PlaygroundContext';
import { AgentStatus, formatHTR } from '@/lib/playground/mock';

const STATUS_COLORS: Record<AgentStatus, string> = {
  active: 'text-green-400 border-green-500/40',
  paused: 'text-amber-400 border-amber-500/40',
  revoked: 'text-red-400 border-red-500/40',
};

function HTRInput({
  label,
  cents,
  onChangeCents,
}: {
  label: string;
  cents: number;
  onChangeCents: (cents: number) => void;
}) {
  const [text, setText] = useState(formatHTR(cents));

  // Keep the input in sync if the value changes from outside.
  useEffect(() => {
    setText(formatHTR(cents));
  }, [cents]);

  const commit = () => {
    const parsed = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChangeCents(Math.round(parsed * 100));
    } else {
      setText(formatHTR(cents));
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
        <span className="px-3 text-xs text-slate-400 select-none">HTR</span>
      </div>
    </div>
  );
}

export function AgentConfigCard() {
  const {
    walletAddress,
    regenerateWallet,
    status,
    setStatus,
    maxPerTxCents,
    setMaxPerTxCents,
    maxPerDayCents,
    setMaxPerDayCents,
    isExecuting,
  } = usePlayground();

  return (
    <div
      data-tour="config"
      className="bg-slate-800 rounded-xl border border-slate-700 p-5"
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-lg font-bold text-white">Agent Configuration</h3>
        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          Simulation
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        On-chain identity and spending guardrails
      </p>

      <label className="block text-xs text-slate-400 mb-1.5">Wallet Address</label>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          readOnly
          value={walletAddress}
          className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono truncate"
        />
        <button
          onClick={regenerateWallet}
          disabled={isExecuting}
          title="Generate a new mock wallet"
          className="px-3 rounded-lg border border-slate-600 bg-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-500 transition-colors disabled:opacity-40"
        >
          ↻
        </button>
      </div>

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
        <HTRInput
          label="Max per Transaction"
          cents={maxPerTxCents}
          onChangeCents={setMaxPerTxCents}
        />
        <HTRInput
          label="Max per Day"
          cents={maxPerDayCents}
          onChangeCents={setMaxPerDayCents}
        />
      </div>
    </div>
  );
}
