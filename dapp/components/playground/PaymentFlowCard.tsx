'use client';

import { FlowStep, usePlayground } from '@/contexts/PlaygroundContext';
import { formatHTR } from '@/lib/playground/mock';

function StepIcon({ state }: { state: FlowStep['state'] }) {
  if (state === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-green-500/15 border border-green-500/50 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-500/15 border border-red-500/50 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/50 flex items-center justify-center shrink-0">
      <div className="w-2.5 h-2.5 rounded-full bg-hathor-orange animate-pulse" />
    </div>
  );
}

export function PaymentFlowCard() {
  const { flowSteps, txLog } = usePlayground();

  return (
    <div
      data-tour="flow"
      className="bg-slate-800 rounded-xl border border-slate-700 p-5"
    >
      <h3 className="text-lg font-bold text-white mb-4">
        Watch an AI agent pay for a service
      </h3>

      {flowSteps.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-400">Waiting for a request...</p>
          <p className="text-sm text-slate-500 mt-1">
            The x402 payment flow will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {flowSteps.map((step, i) => (
            <div key={`${step.id}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon state={step.state} />
                {i < flowSteps.length - 1 && (
                  <div className="w-px flex-1 bg-slate-700 my-1" />
                )}
              </div>
              <div className="pb-5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-medium ${
                      step.state === 'error'
                        ? 'text-red-400'
                        : step.state === 'active'
                          ? 'text-amber-400'
                          : 'text-white'
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.ms !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                      {step.ms}ms
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs font-mono mt-0.5 break-words ${
                    step.state === 'error' ? 'text-red-400/80' : 'text-slate-400'
                  }`}
                >
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {txLog.length > 0 && (
        <div data-tour="txlog" className="mt-2 pt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Transaction Log</h4>
          <div className="space-y-2">
            {txLog.map((entry, i) => (
              <div
                key={`${entry.txId}-${i}`}
                className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2.5"
                title={`tx ${entry.txId}`}
              >
                <span className="text-sm text-slate-300 font-mono truncate">
                  {entry.route}
                </span>
                <span className="text-sm text-green-400 font-mono whitespace-nowrap ml-3">
                  {formatHTR(entry.amountCents)} HTR
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
