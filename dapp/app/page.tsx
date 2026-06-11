'use client';

import { useEffect } from 'react';
import { PlaygroundProvider, usePlayground } from '@/contexts/PlaygroundContext';
import { AgentConfigCard } from '@/components/playground/AgentConfigCard';
import { SpendTrackerCard } from '@/components/playground/SpendTrackerCard';
import { EndpointsCard } from '@/components/playground/EndpointsCard';
import { ResponseCard } from '@/components/playground/ResponseCard';
import { PaymentFlowCard } from '@/components/playground/PaymentFlowCard';
import { GuidedTour } from '@/components/playground/GuidedTour';

const TOUR_SEEN_KEY = 'x402_playground_tour_seen';

function PlaygroundPage() {
  const { startTour, tourIndex } = usePlayground();

  // Auto-start the guided tour on first visit.
  useEffect(() => {
    if (!localStorage.getItem(TOUR_SEEN_KEY)) {
      localStorage.setItem(TOUR_SEEN_KEY, '1');
      startTour();
    }
  }, [startTour]);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="container mx-auto px-6 py-6 max-w-[1600px]">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Agent Playground</h1>
            <p className="text-slate-400 mt-1">
              Simulate how an AI agent interacts with paid API endpoints using the
              x402 protocol on Hathor
            </p>
          </div>
          <button
            onClick={startTour}
            disabled={tourIndex !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Guided Demo
          </button>
        </div>

        {/* 3-column playground */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] xl:grid-cols-[minmax(280px,340px)_1fr_minmax(340px,420px)] gap-6 items-start">
          {/* Left: agent config + spend tracker */}
          <div className="space-y-6">
            <AgentConfigCard />
            <SpendTrackerCard />
          </div>

          {/* Middle: endpoints + response */}
          <div className="space-y-6">
            <EndpointsCard />
            <ResponseCard />
          </div>

          {/* Right: payment flow + tx log */}
          <div className="lg:col-span-2 xl:col-span-1">
            <PaymentFlowCard />
          </div>
        </div>
      </div>

      <GuidedTour />
    </div>
  );
}

export default function Home() {
  return (
    <PlaygroundProvider>
      <PlaygroundPage />
    </PlaygroundProvider>
  );
}
