'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useHathor } from '@/contexts/HathorContext';
import { EscrowDetail } from '@/components/EscrowDetail';
import { EscrowState } from '@/types/hathor';
import Header from '@/components/Header';

export default function EscrowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { fetchEscrowState, escrows } = useHathor();
  const [escrow, setEscrow] = useState<EscrowState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try from cache first
    if (escrows[id]) {
      setEscrow(escrows[id]);
      setIsLoading(false);
      return;
    }

    // Fetch from fullnode
    fetchEscrowState(id)
      .then(state => {
        if (state) {
          setEscrow(state);
        } else {
          setError('Escrow not found');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id, fetchEscrowState, escrows]);

  const handleRefresh = async () => {
    setIsLoading(true);
    const state = await fetchEscrowState(id);
    if (state) setEscrow(state);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <Header appName="x402 Escrow Manager" selectedToken="HTR" onTokenChange={() => {}} />

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
            &larr; Back to Dashboard
          </Link>
          <button onClick={handleRefresh} className="text-slate-400 hover:text-white transition-colors text-sm ml-auto">
            Refresh
          </button>
        </div>

        {isLoading && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
            <p className="text-slate-400">Loading escrow...</p>
          </div>
        )}

        {error && (
          <div className="bg-slate-800 rounded-xl border border-red-700 p-8 text-center">
            <p className="text-red-400">{error}</p>
            <p className="text-sm text-slate-500 mt-2 font-mono break-all">{id}</p>
          </div>
        )}

        {escrow && <EscrowDetail escrow={escrow} onRefund={handleRefresh} />}
      </main>
    </div>
  );
}
