'use client';

import { usePlayground } from '@/contexts/PlaygroundContext';
import { formatHTR } from '@/lib/playground/mock';

export function ResponseCard() {
  const { response, isExecuting } = usePlayground();

  return (
    <div
      data-tour="response"
      className="bg-slate-800 rounded-xl border border-slate-700 p-5"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-white">Response</h3>
        {response && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300">
              {response.totalMs}ms
            </span>
            <span
              className={`text-xs px-2.5 py-1 rounded-full border ${
                response.ok
                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                  : 'bg-red-500/10 text-red-400 border-red-500/30'
              }`}
            >
              {response.statusLabel}
            </span>
            {response.priceCents !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {formatHTR(response.priceCents)} HTR
              </span>
            )}
          </div>
        )}
      </div>

      {response ? (
        <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-auto max-h-96">
          {JSON.stringify(response.body, null, 2)}
        </pre>
      ) : (
        <div className="py-12 text-center">
          <p className="text-slate-400">
            {isExecuting ? 'Waiting for the payment flow...' : 'No response yet'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            API response data will appear here
          </p>
        </div>
      )}
    </div>
  );
}
