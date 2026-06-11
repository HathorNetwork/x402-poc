'use client';

import { useEffect, useState } from 'react';
import { usePlayground } from '@/contexts/PlaygroundContext';
import { formatHTR } from '@/lib/playground/mock';

function timeToUtcMidnight(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const mins = Math.floor((next.getTime() - now.getTime()) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function SpendTrackerCard() {
  const { spentCents, maxPerDayCents, spendEntries } = usePlayground();
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
      className="bg-slate-800 rounded-xl border border-slate-700 p-5"
    >
      <h3 className="text-lg font-bold text-white mb-1">Spend Tracker</h3>
      <p className="text-xs text-slate-400 mb-4">
        Real-time budget usage for this session
      </p>

      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-hathor-gradient transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <p className="text-white">
          <span className="font-bold">{formatHTR(spentCents)}</span>
          <span className="text-slate-400"> / {formatHTR(maxPerDayCents)} HTR</span>
        </p>
        <span className="text-sm text-slate-400">{pct.toFixed(1)}%</span>
      </div>
      <p className="text-xs text-slate-500">
        Resets at 00:00 UTC{countdown ? ` (${countdown})` : ''}
      </p>

      {spendEntries.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-700 space-y-1.5">
          {spendEntries.map((entry, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-300 font-mono">{entry.route}</span>
              <span className="text-slate-400 font-mono">
                -{formatHTR(entry.amountCents)} HTR
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
