'use client';

import Link from 'next/link';
import { useHathor } from '@/contexts/HathorContext';
import { EscrowStatusBadge } from './EscrowStatusBadge';
import { formatAddress } from '@/lib/utils';

export function EscrowList() {
  const { escrows, isLoadingEscrows, refreshEscrows } = useHathor();

  const escrowList = Object.values(escrows);

  if (isLoadingEscrows && escrowList.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <p className="text-slate-400 text-center">Loading escrows...</p>
      </div>
    );
  }

  if (escrowList.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
        <p className="text-slate-400 mb-2">No escrows yet</p>
        <p className="text-sm text-slate-500">Create your first escrow to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Your Escrows</h3>
        <button
          onClick={refreshEscrows}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {escrowList.map((escrow) => {
        const isExpired = escrow.deadline < Math.floor(Date.now() / 1000);
        const deadlineDate = new Date(escrow.deadline * 1000);
        const amountDisplay = (escrow.amount / 100).toFixed(2);
        const tokenLabel = escrow.token_uid === '00' ? 'HTR' : escrow.token_uid.slice(0, 8) + '...';

        return (
          <Link
            key={escrow.ncId}
            href={`/escrow/${escrow.ncId}`}
            className="block bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <EscrowStatusBadge phase={escrow.phase} />
                <span className="text-white font-mono text-sm">{formatAddress(escrow.ncId)}</span>
              </div>
              <span className="text-white font-bold">{amountDisplay} {tokenLabel}</span>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Seller: {formatAddress(escrow.seller)}</span>
              <span>
                {escrow.phase === 'LOCKED' ? (
                  isExpired ? (
                    <span className="text-red-400">Expired</span>
                  ) : (
                    `Deadline: ${deadlineDate.toLocaleString()}`
                  )
                ) : (
                  escrow.phase === 'RELEASED' ? 'Funds released to seller' : 'Funds refunded'
                )}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
