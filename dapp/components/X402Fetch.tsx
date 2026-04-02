'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { config } from '@/lib/config';
import { toast } from '@/lib/toast';
import { EscrowStatusBadge } from './EscrowStatusBadge';
import { formatAddress } from '@/lib/utils';

interface PaymentOption {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  description: string;
  resource: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    facilitatorUrl: string;
    facilitatorAddress: string;
    blueprintId: string;
    deadlineSeconds: number;
  };
}

interface PaymentHistory {
  id: string;
  url: string;
  ncId: string;
  amount: string;
  asset: string;
  timestamp: Date;
  resourceData: any;
  status: 'paid' | 'failed';
}

type Step = 'idle' | 'fetching' | 'got402' | 'creating_escrow' | 'waiting_confirmation' | 'retrying' | 'done' | 'error';

export function X402Fetch() {
  const { sendNanoContractTx, address, refreshBalance } = useWallet();
  const { network, isConnected, addEscrow } = useHathor();

  const [url, setUrl] = useState('http://localhost:3001/weather');
  const [step, setStep] = useState<Step>('idle');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<PaymentOption | null>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ncId, setNcId] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentHistory[]>([]);

  const reset = () => {
    setStep('idle');
    setPaymentOptions([]);
    setSelectedOption(null);
    setResourceData(null);
    setError(null);
    setNcId(null);
  };

  // Step 1: Fetch the URL, expect 402
  const handleFetch = async () => {
    reset();
    setStep('fetching');

    try {
      const resp = await fetch(url, { mode: 'cors' });

      if (resp.ok) {
        const data = await resp.json();
        setResourceData(data);
        setStep('done');
        toast.success('Resource is free — no payment needed!');
        return;
      }

      if (resp.status !== 402) {
        throw new Error(`Unexpected status: ${resp.status}`);
      }

      const body = await resp.json();
      if (!body.accepts || body.accepts.length === 0) {
        throw new Error('402 response has no payment options');
      }

      setPaymentOptions(body.accepts);
      setSelectedOption(body.accepts[0]);
      setStep('got402');
    } catch (err: any) {
      console.error('X402 fetch error:', err);
      setError(err.message || 'Failed to fetch');
      setStep('error');
    }
  };

  // Step 2: Create escrow and pay
  const handlePay = async () => {
    if (!selectedOption || !isConnected || !address) return;

    const opt = selectedOption;
    setStep('creating_escrow');

    try {
      const deadline = Math.floor(Date.now() / 1000) + opt.extra.deadlineSeconds;
      const amount = parseInt(opt.amount);

      toast.info('Confirm the escrow deposit in your wallet...');

      const result = await sendNanoContractTx({
        network,
        blueprint_id: opt.extra.blueprintId,
        method: 'initialize',
        args: [
          opt.payTo,
          opt.extra.facilitatorAddress,
          opt.asset,
          deadline,
          opt.resource,
          'dapp-x402-fetch',
        ],
        actions: [{
          type: 'deposit',
          amount: String(amount),
          token: opt.asset,
        }],
        push_tx: true,
      });

      const escrowId = result?.response?.hash || result?.hash || result?.response?.response?.hash;
      if (!escrowId) {
        throw new Error('No transaction hash in response');
      }

      setNcId(escrowId);
      await addEscrow(escrowId);
      toast.success(`Escrow created: ${escrowId.slice(0, 12)}...`);

      // Step 3: Wait for confirmation
      setStep('waiting_confirmation');
      await waitForConfirmation(escrowId);

      // Step 4: Retry with payment proof
      setStep('retrying');
      const paymentPayload = {
        scheme: 'hathor-escrow',
        network: `hathor:${network}`,
        payload: {
          ncId: escrowId,
          depositTxId: escrowId,
          buyerAddress: address,
        },
      };

      const paidResp = await fetch(url, {
        headers: { 'X-Payment': JSON.stringify(paymentPayload) },
      });

      if (paidResp.status !== 200) {
        const errBody = await paidResp.json().catch(() => ({}));
        throw new Error(errBody.reason || errBody.error || `Payment rejected: ${paidResp.status}`);
      }

      const data = await paidResp.json();
      setResourceData(data);
      setStep('done');
      toast.success('Resource received!');

      // Add to history
      setHistory(prev => [{
        id: escrowId,
        url,
        ncId: escrowId,
        amount: opt.amount,
        asset: opt.asset,
        timestamp: new Date(),
        resourceData: data,
        status: 'paid',
      }, ...prev]);

      refreshBalance('00', network);
    } catch (err: any) {
      setError(err.message);
      setStep('error');
      toast.error(err.message);
    }
  };

  const waitForConfirmation = async (txId: string) => {
    const nodeUrl = config.hathorNodeUrls[network];
    for (let i = 0; i < 60; i++) {
      try {
        const resp = await fetch(`${nodeUrl}/transaction?id=${txId}`);
        const data = await resp.json();
        if (data.success && data.meta?.first_block) return;
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Transaction confirmation timeout (60s)');
  };

  const amountDisplay = selectedOption
    ? `${(parseInt(selectedOption.amount) / 100).toFixed(2)} ${selectedOption.asset === '00' ? 'HTR' : 'tokens'}`
    : '';

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-2">Access a Paid Resource</h3>
        <p className="text-sm text-slate-400 mb-4">
          Enter the URL of an x402-enabled API. The dApp will handle the payment flow automatically.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://api.example.com/data"
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono text-sm"
            disabled={step !== 'idle' && step !== 'error' && step !== 'done'}
          />
          <button
            onClick={step === 'idle' || step === 'error' || step === 'done' ? handleFetch : undefined}
            disabled={!url || (step !== 'idle' && step !== 'error' && step !== 'done')}
            className="px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            style={{
              background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)',
              color: '#0f172a'
            }}
          >
            Fetch
          </button>
        </div>
      </div>

      {/* Step: Fetching */}
      {step === 'fetching' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-amber-400 text-lg mb-2">Fetching resource...</div>
          <p className="text-slate-400 text-sm">Requesting {url}</p>
        </div>
      )}

      {/* Step: Got 402 — show payment options */}
      {step === 'got402' && selectedOption && (
        <div className="bg-slate-800 rounded-xl border border-amber-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">💰</span>
            <div>
              <h3 className="text-lg font-bold text-amber-400">402 — Payment Required</h3>
              <p className="text-sm text-slate-400">This resource requires payment to access</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Resource</span>
              <span className="text-white font-mono text-xs">{selectedOption.resource}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Amount</span>
              <span className="text-white font-bold">{amountDisplay}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Pay to (seller)</span>
              <span className="text-white font-mono text-xs">{formatAddress(selectedOption.payTo)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Facilitator</span>
              <span className="text-white font-mono text-xs">{formatAddress(selectedOption.extra.facilitatorAddress)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Deadline</span>
              <span className="text-white">{selectedOption.extra.deadlineSeconds}s</span>
            </div>
            {selectedOption.description && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Description</span>
                <span className="text-white">{selectedOption.description}</span>
              </div>
            )}
          </div>

          {paymentOptions.length > 1 && (
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-2 block">Payment option:</label>
              <div className="flex gap-2">
                {paymentOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedOption(opt)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selectedOption === opt
                        ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                        : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {opt.description || `${(parseInt(opt.amount) / 100).toFixed(2)} ${opt.asset === '00' ? 'HTR' : opt.asset.slice(0, 6)}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handlePay}
              disabled={!isConnected}
              className="flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{
                background: isConnected
                  ? 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)'
                  : '#475569',
                color: '#0f172a'
              }}
            >
              {isConnected ? `Pay ${amountDisplay} & Access` : 'Connect Wallet First'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-3 rounded-lg text-slate-400 hover:text-white border border-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step: Creating escrow */}
      {step === 'creating_escrow' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Creating escrow...</div>
          <p className="text-slate-400 text-sm">Confirm the deposit in your wallet</p>
        </div>
      )}

      {/* Step: Waiting confirmation */}
      {step === 'waiting_confirmation' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Waiting for on-chain confirmation...</div>
          <p className="text-slate-400 text-sm">
            Escrow ID: <span className="font-mono">{ncId?.slice(0, 16)}...</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">This usually takes 8-16 seconds</p>
        </div>
      )}

      {/* Step: Retrying */}
      {step === 'retrying' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Payment verified! Fetching resource...</div>
          <p className="text-slate-400 text-sm">Retrying request with payment proof</p>
        </div>
      )}

      {/* Step: Done — show resource */}
      {step === 'done' && resourceData && (
        <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">✅</span>
            <div>
              <h3 className="text-lg font-bold text-green-400">Resource Received</h3>
              {ncId && <p className="text-sm text-slate-400">Paid via escrow {formatAddress(ncId)}</p>}
            </div>
          </div>

          <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
            {JSON.stringify(resourceData.data || resourceData, null, 2)}
          </pre>

          <button
            onClick={reset}
            className="mt-4 px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors"
          >
            Make another request
          </button>
        </div>
      )}

      {/* Step: Error */}
      {step === 'error' && (
        <div className="bg-slate-800 rounded-xl border border-red-500/50 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">❌</span>
            <h3 className="text-lg font-bold text-red-400">Error</h3>
          </div>
          <p className="text-slate-300 text-sm mb-4">{error}</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Payment History */}
      {history.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Payment History</h3>
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <div>
                  <p className="text-white text-sm font-mono">{entry.url}</p>
                  <p className="text-xs text-slate-500">
                    {entry.timestamp.toLocaleTimeString()} — Escrow: {formatAddress(entry.ncId)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-sm">
                    {(parseInt(entry.amount) / 100).toFixed(2)} {entry.asset === '00' ? 'HTR' : 'tokens'}
                  </p>
                  <EscrowStatusBadge phase="RELEASED" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
