'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayground } from '@/contexts/PlaygroundContext';

interface TourStep {
  target: string | null; // data-tour id, null = centered
  title: string;
  body: string;
  action?: 'select-weather' | 'run-request';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to the Playground',
    body: "This is a live simulation of how AI agents pay for API access using the x402 protocol on Hathor Network. We'll walk through the entire flow — from wallet setup to budget tracking.",
  },
  {
    target: 'config',
    title: 'Agent Wallet',
    body: 'Every agent needs an on-chain identity. This wallet address is how the agent signs payments. In production, this maps to a real Hathor wallet — for now it is a mock you can regenerate freely.',
  },
  {
    target: 'policies',
    title: 'Spending Policies',
    body: 'Guardrails are critical. The per-transaction limit caps any single payment, while the daily limit resets at UTC midnight. These are enforced agent-side before signing any transaction.',
  },
  {
    target: 'endpoints',
    title: 'Choose an API',
    body: "These are merchant endpoints priced with x402. Each shows its per-request cost in HTR. Let's start with the weather API — it's the cheapest at 0.01 HTR.",
    action: 'select-weather',
  },
  {
    target: 'send',
    title: 'Send the Request',
    body: 'When the agent calls this endpoint, the x402 client handles everything: detects the 402 challenge, signs an HTR payment, and resubmits the request — all in one fetch() call.',
    action: 'run-request',
  },
  {
    target: 'flow',
    title: 'x402 Payment Flow',
    body: 'Watch the payment flow: HTTP request → 402 challenge → sign → verify → settle → data delivered. On Hathor the payment settles as a regular feeless UTXO transaction.',
  },
  {
    target: 'response',
    title: 'API Response',
    body: "The data comes back just like a normal HTTP response. The agent doesn't need to know about payments — the x402 layer handles that transparently.",
  },
  {
    target: 'spend',
    title: 'Budget Tracking',
    body: 'Every payment is tracked in real time. The progress bar shows how much of the daily budget has been consumed. This is how operators maintain visibility and control.',
  },
  {
    target: 'config',
    title: 'Guardrails in Action',
    body: "The agent checks maxPerTransaction and maxPerDay before signing — lower the limits below an endpoint's price and it refuses automatically. Set the agent to 'paused' or 'revoked' to see facilitator-side rejections.",
  },
  {
    target: null,
    title: "That's x402 on Hathor",
    body: 'HTTP-native micropayments for AI agents. No card rails, no fees. Agents pay for exactly what they use, with built-in spending controls. Try more endpoints or break the policies on purpose!',
  },
];

const TOOLTIP_WIDTH = 400;
const TOOLTIP_EST_HEIGHT = 290;
const MARGIN = 16;

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function GuidedTour() {
  const {
    tourIndex,
    nextTourStep,
    prevTourStep,
    exitTour,
    setSelectedId,
    runRequest,
    isExecuting,
  } = usePlayground();

  const [rect, setRect] = useState<Rect | null>(null);
  const stepRef = useRef<number | null>(null);

  const step = tourIndex !== null ? TOUR_STEPS[tourIndex] : null;
  const isLast = tourIndex === TOUR_STEPS.length - 1;
  const waiting = step?.action === 'run-request' && isExecuting;

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
  }, [step?.target]);

  // On step change: run step actions, scroll target into view, measure.
  useEffect(() => {
    if (tourIndex === null || !step) return;
    const isNewStep = stepRef.current !== tourIndex;
    stepRef.current = tourIndex;

    if (isNewStep && step.action === 'select-weather') setSelectedId('weather');
    if (isNewStep && step.action === 'run-request') void runRequest();

    if (step.target) {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    measure();
    // Re-measure while smooth-scroll settles, then on viewport changes.
    const timers = [150, 350, 600].map((ms) => setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tourIndex, step, measure, setSelectedId, runRequest]);

  // Re-measure when the run finishes (panels grow with content).
  useEffect(() => {
    if (!isExecuting) measure();
  }, [isExecuting, measure]);

  if (tourIndex === null || !step) return null;

  const finish = () => exitTour();

  // --- tooltip position ------------------------------------------------------
  let tooltipStyle: React.CSSProperties;
  if (!rect) {
    tooltipStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampTop = Math.max(
      MARGIN,
      Math.min(rect.top, vh - TOOLTIP_EST_HEIGHT - MARGIN)
    );
    if (vw - rect.right >= TOOLTIP_WIDTH + MARGIN * 2) {
      tooltipStyle = { top: clampTop, left: rect.right + MARGIN };
    } else if (rect.left >= TOOLTIP_WIDTH + MARGIN * 2) {
      tooltipStyle = { top: clampTop, left: rect.left - TOOLTIP_WIDTH - MARGIN };
    } else if (rect.bottom + TOOLTIP_EST_HEIGHT + MARGIN < vh) {
      tooltipStyle = {
        top: rect.bottom + MARGIN,
        left: Math.max(MARGIN, Math.min(rect.left, vw - TOOLTIP_WIDTH - MARGIN)),
      };
    } else {
      tooltipStyle = {
        top: Math.max(MARGIN, rect.top - TOOLTIP_EST_HEIGHT - MARGIN),
        left: Math.max(MARGIN, Math.min(rect.left, vw - TOOLTIP_WIDTH - MARGIN)),
      };
    }
  }

  return (
    <>
      {/* Click blocker */}
      <div className="fixed inset-0 z-[55]" />

      {/* Spotlight (dims everything except the target) */}
      {rect ? (
        <div
          className="fixed z-[60] rounded-xl border-2 border-hathor-orange pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
          }}
        />
      ) : (
        <div
          className="fixed inset-0 z-[60] pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[70] bg-slate-800 border border-slate-600 rounded-xl p-5 shadow-2xl"
        style={{ width: TOOLTIP_WIDTH, maxWidth: 'calc(100vw - 32px)', ...tooltipStyle }}
      >
        <p className="text-xs text-slate-400 mb-1">
          Step {tourIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h4 className="text-lg font-bold text-white mb-2">{step.title}</h4>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === tourIndex ? 'w-5 bg-hathor-orange' : 'w-1.5 bg-amber-700/60'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Exit tour
          </button>
          <div className="flex gap-2">
            {tourIndex > 0 && (
              <button
                onClick={prevTourStep}
                disabled={waiting}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-600 hover:border-slate-400 transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? finish : nextTourStep}
              disabled={waiting}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-70"
              style={{
                background:
                  'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)',
                color: '#0f172a',
              }}
            >
              {waiting ? 'Waiting...' : isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
