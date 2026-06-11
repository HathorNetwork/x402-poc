'use client';

import { useEffect, useState } from 'react';
import { usePlayground } from '@/contexts/PlaygroundContext';
import {
  TOKEN_SYMBOL,
  explorerTxUrl,
  formatAmount,
  shortHash,
} from '@/lib/playground/mock';

function timeToUtcMidnight(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const mins = Math.floor((next.getTime() - now.getTime()) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function SpendTrackerCard() {
  const { spentCents, maxPerDayCents, spendEntries, balanceAtomic } = usePlayground();
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    setCountdown(timeToUtcMidnight());
    const t = setInterval(() => setCountdown(timeToUtcMidnight()), 60000);
    return () => clearInterval(t);
  }, []);

  const pct = maxPerDayCents > 0 ? (spentCents / maxPerDayCents) * 100 : 0;

  return (
    <div
      data-tour="spend"
      className="bg-slate-800 rounded-xl border border-slate-700 p-5 h-full overflow-y-auto"
    >
      <h3 className="text-lg font-bold text-white mb-1">Spend Tracker</h3>
      <p className="text-xs text-slate-400 mb-4">
        Real-time budget usage for this session
      </p>

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-slate-400">Wallet balance</span>
        <span className="text-white font-bold">
          {balanceAtomic === null ? '—' : formatAmount(balanceAtomic)}{' '}
          <span className="text-slate-400 font-normal">{TOKEN_SYMBOL}</span>
        </span>
      </div>

      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-hathor-gradient transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <p className="text-white">
          <span className="font-bold">{formatAmount(spentCents)}</span>
          <span className="text-slate-400">
            {' '}
            / {formatAmount(maxPerDayCents)} {TOKEN_SYMBOL}
          </span>
        </p>
        <span className="text-sm text-slate-400">{pct.toFixed(1)}%</span>
      </div>
      <p className="text-xs text-slate-500">
        Resets at 00:00 UTC{countdown ? ` (${countdown})` : ''}
      </p>

      {spendEntries.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-700 space-y-1.5">
          {spendEntries.map((entry, i) => (
            <div key={`${entry.txId}-${i}`} className="flex justify-between text-sm gap-2">
              <span className="text-slate-300 font-mono truncate">{entry.route}</span>
              <span className="whitespace-nowrap">
                <span className="text-slate-400 font-mono">
                  -{formatAmount(entry.amountCents)} {TOKEN_SYMBOL}
                </span>
                <a
                  href={explorerTxUrl(entry.txId)}
                  target="_blank"
                  rel="noreferrer"
                  title={`View tx ${entry.txId} on the explorer`}
                  className="ml-2 text-xs text-amber-400 hover:text-amber-300 hover:underline font-mono"
                >
                  {shortHash(entry.txId)} ↗
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
