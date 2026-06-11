'use client';

import { usePlayground } from '@/contexts/PlaygroundContext';
import { formatHTR } from '@/lib/playground/mock';

export function EndpointsCard() {
  const { endpoints, selectedId, setSelectedId, isExecuting, runRequest } =
    usePlayground();

  return (
    <div data-tour="endpoints" className="rounded-xl">
      <h3 className="text-lg font-bold text-white mb-3">
        Ask an AI agent to complete a task
      </h3>

      <div className="space-y-2 mb-3">
        {endpoints.map((ep) => {
          const selected = ep.id === selectedId;
          return (
            <button
              key={ep.id}
              onClick={() => setSelectedId(ep.id)}
              disabled={isExecuting}
              className={`w-full text-left bg-slate-800 rounded-xl border px-4 py-3 transition-colors disabled:opacity-60 ${
                selected
                  ? 'border-hathor-orange'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    GET
                  </span>
                  <span className="text-white font-mono text-sm truncate">
                    {ep.path}
                  </span>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 whitespace-nowrap">
                  {formatHTR(ep.priceCents)} HTR
                </span>
              </div>
              <p className="text-sm text-slate-400">{ep.description}</p>
            </button>
          );
        })}
      </div>

      <button
        data-tour="send"
        onClick={runRequest}
        disabled={isExecuting}
        className="w-full py-2.5 rounded-lg font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-80"
        style={{
          background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)',
          color: '#0f172a',
        }}
      >
        {isExecuting ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-slate-900/40 border-t-slate-900 rounded-full animate-spin" />
            Executing...
          </span>
        ) : (
          'Execute task'
        )}
      </button>
    </div>
  );
}
