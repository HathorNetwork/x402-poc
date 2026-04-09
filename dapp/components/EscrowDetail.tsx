'use client';

import { useState } from 'react';
import { EscrowState } from '@/types/hathor';
import { EscrowStatusBadge } from './EscrowStatusBadge';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { formatAddress } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface EscrowDetailProps {
  escrow: EscrowState;
  onRefund?: () => void;
}

export function EscrowDetail({ escrow, onRefund }: EscrowDetailProps) {
  const { sendNanoContractTx, address } = useWallet();
  const { network, isConnected, refreshEscrows } = useHathor();
  const [isRefunding, setIsRefunding] = useState(false);

  const deadlineDate = new Date(escrow.deadline * 1000);
  const isExpired = escrow.deadline < Math.floor(Date.now() / 1000);
  const canRefund = escrow.phase === 'LOCKED' && isConnected;
  const amountDisplay = (escrow.amount / 100).toFixed(2);
  const tokenLabel = escrow.token_uid === '00' ? 'HTR' : escrow.token_uid.slice(0, 8) + '...';

  const handleRefund = async () => {
    if (!canRefund) return;
    setIsRefunding(true);

    try {
      toast.info('Please confirm the refund in your wallet...');

      await sendNanoContractTx({
        network,
        nc_id: escrow.ncId,
        method: 'refund',
        args: [],
        actions: [{
          type: 'withdrawal',
          amount: String(escrow.amount),
          token: escrow.token_uid,
          address: escrow.buyer,
        }],
        push_tx: true,
      });

      toast.success('Refund successful! Funds returned.');
      await refreshEscrows();
      onRefund?.();
    } catch (error: any) {
      toast.error(error.message || 'Refund failed');
    } finally {
      setIsRefunding(false);
    }
  };

  const fields = [
    { label: 'Contract ID', value: escrow.ncId, mono: true },
    { label: 'Phase', value: escrow.phase, badge: true },
    { label: 'Amount', value: `${amountDisplay} ${tokenLabel}` },
    { label: 'Buyer', value: escrow.buyer, mono: true },
    { label: 'Seller', value: escrow.seller, mono: true },
    { label: 'Facilitator', value: escrow.facilitator, mono: true },
    { label: 'Token UID', value: escrow.token_uid, mono: true },
    { label: 'Deadline', value: `${deadlineDate.toLocaleString()}${isExpired ? ' (EXPIRED)' : ''}` },
    { label: 'Resource URL', value: escrow.resource_url },
    { label: 'Request Hash', value: escrow.request_hash, mono: true },
  ];

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Escrow Details</h3>
        <EscrowStatusBadge phase={escrow.phase} />
      </div>

      <div className="space-y-4">
        {fields.map(({ label, value, mono, badge }) => (
          <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-sm text-slate-400 sm:w-32 flex-shrink-0">{label}</span>
            {badge ? (
              <EscrowStatusBadge phase={value} />
            ) : (
              <span className={`text-white text-sm break-all ${mono ? 'font-mono' : ''}`}>
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      {canRefund && (
        <div className="mt-6 pt-6 border-t border-slate-700">
          <button
            onClick={handleRefund}
            disabled={isRefunding}
            className="px-6 py-3 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
          >
            {isRefunding ? 'Refunding...' : `Refund ${amountDisplay} ${tokenLabel} to Buyer`}
          </button>
          {isExpired && (
            <p className="text-sm text-amber-400 mt-2">Deadline expired — anyone can trigger this refund.</p>
          )}
        </div>
      )}

      {escrow.phase === 'RELEASED' && (
        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-green-400 text-sm">Funds have been released to the seller.</p>
        </div>
      )}

      {escrow.phase === 'REFUNDED' && (
        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-slate-400 text-sm">Funds have been refunded to the buyer.</p>
        </div>
      )}
    </div>
  );
}
