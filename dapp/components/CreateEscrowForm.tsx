'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { config } from '@/lib/config';
import { toast } from '@/lib/toast';

interface CreateEscrowFormProps {
  onCreated?: (ncId: string) => void;
}

export function CreateEscrowForm({ onCreated }: CreateEscrowFormProps) {
  const { sendNanoContractTx, address } = useWallet();
  const { network, addEscrow, isConnected } = useHathor();

  const [sellerAddress, setSellerAddress] = useState(config.sellerAddress);
  const [amount, setAmount] = useState('100');
  const [resourceUrl, setResourceUrl] = useState('http://localhost:3000/weather');
  const [deadlineMinutes, setDeadlineMinutes] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) {
      toast.error('Connect your wallet first');
      return;
    }

    if (!config.blueprintId) {
      toast.error('Blueprint ID not configured');
      return;
    }

    setIsSubmitting(true);
    const deadline = Math.floor(Date.now() / 1000) + parseInt(deadlineMinutes) * 60;
    const amountCents = parseInt(amount);

    try {
      toast.info('Please confirm the transaction in your wallet...');

      const result = await sendNanoContractTx({
        network,
        blueprint_id: config.blueprintId,
        method: 'initialize',
        args: [
          sellerAddress,
          config.facilitatorAddress,
          '00', // HTR token
          deadline,
          resourceUrl,
          'dapp-escrow',
        ],
        actions: [{
          type: 'deposit',
          amount: String(amountCents),
          token: '00',
        }],
        push_tx: true,
      });

      // Extract ncId from response (varies by wallet type)
      const ncId = result?.response?.hash || result?.hash || result?.response?.response?.hash;
      if (ncId) {
        await addEscrow(ncId);
        toast.success(`Escrow created! ID: ${ncId.slice(0, 12)}...`);
        setShowForm(false);
        onCreated?.(ncId);
      } else {
        toast.success('Transaction sent! Refresh to see the escrow.');
        console.log('Full result:', result);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create escrow');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        disabled={!isConnected}
        className="w-full px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isConnected
            ? 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)'
            : '#475569',
          color: '#0f172a'
        }}
      >
        {isConnected ? 'Create New Escrow' : 'Connect Wallet to Create Escrow'}
      </button>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Create Escrow</h3>
        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Seller Address</label>
          <input
            type="text"
            value={sellerAddress}
            onChange={e => setSellerAddress(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Amount (cents HTR)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              required
            />
            <p className="text-xs text-slate-500 mt-1">{(parseInt(amount || '0') / 100).toFixed(2)} HTR</p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Deadline (minutes)</label>
            <select
              value={deadlineMinutes}
              onChange={e => setDeadlineMinutes(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Resource URL</label>
          <input
            type="text"
            value={resourceUrl}
            onChange={e => setResourceUrl(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            required
          />
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)', color: '#0f172a' }}
          >
            {isSubmitting ? 'Creating...' : `Deposit ${(parseInt(amount || '0') / 100).toFixed(2)} HTR`}
          </button>
        </div>
      </form>
    </div>
  );
}
