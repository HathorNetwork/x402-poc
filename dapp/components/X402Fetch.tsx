'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { config } from '@/lib/config';
import { toast } from '@/lib/toast';
import { formatAddress } from '@/lib/utils';

interface PaymentOption {
  scheme: string;
  network: string;
  asset: string;
  price: string;
  description: string;
  resource: string;
  payTo: string;
  extra: {
    facilitatorUrl: string;
    facilitatorAddress: string;
    blueprintId?: string;
    channelBlueprintId?: string;
    deadlineSeconds: number;
  };
}

interface PaymentHistory {
  id: string;
  url: string;
  scheme: string;
  contractId: string;
  amount: string;
  timestamp: Date;
}

type Step = 'idle' | 'fetching' | 'got402' | 'creating' | 'waiting_confirmation' | 'retrying' | 'done' | 'error';

const CHANNEL_STORAGE_KEY = 'x402_active_channel';

function getStoredChannel(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CHANNEL_STORAGE_KEY);
}

function storeChannel(channelId: string) {
  localStorage.setItem(CHANNEL_STORAGE_KEY, channelId);
}

function clearStoredChannel() {
  localStorage.removeItem(CHANNEL_STORAGE_KEY);
}

export function X402Fetch() {
  const { sendNanoContractTx, address, refreshBalance } = useWallet();
  const { network, isConnected, addEscrow } = useHathor();

  const [url, setUrl] = useState('https://api.x402.hathor.dev/weather');
  const [step, setStep] = useState<Step>('idle');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<PaymentOption | null>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(getStoredChannel());

  const reset = () => {
    setStep('idle');
    setPaymentOptions([]);
    setSelectedOption(null);
    setResourceData(null);
    setError(null);
    setContractId(null);
  };

  const addToHistory = (scheme: string, id: string, amount: string) => {
    setHistory(prev => [{ id: Date.now().toString(), url, scheme, contractId: id, amount, timestamp: new Date() }, ...prev]);
  };

  // Try to pay with an existing channel (instant — no wallet interaction)
  const payWithChannel = async (channelId: string): Promise<boolean> => {
    const paymentPayload = {
      x402Version: 2,
      scheme: 'hathor-channel',
      network: `hathor:${network}`,
      payload: { channelId, buyerAddress: address },
    };

    const resp = await fetch(url, { mode: 'cors', headers: { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(paymentPayload)) } });
    if (!resp.ok) return false;

    const data = await resp.json();
    setResourceData(data);
    setContractId(channelId);
    setStep('done');
    addToHistory('hathor-channel', channelId, '100');
    refreshBalance('00', network);
    return true;
  };

  // Step 1: Fetch the URL
  const handleFetch = async () => {
    reset();

    // If we have an active channel, try instant payment first
    if (activeChannel) {
      setStep('retrying');
      const ok = await payWithChannel(activeChannel).catch(() => false);
      if (ok) {
        toast.success('Paid via channel (instant!)');
        return;
      }
      // Channel failed — clear it and fall through to normal 402 flow
      clearStoredChannel();
      setActiveChannel(null);
      toast.info('Channel exhausted. Fetching payment options...');
    }

    setStep('fetching');

    try {
      const resp = await fetch(url, { mode: 'cors' });

      if (resp.ok) {
        setResourceData(await resp.json());
        setStep('done');
        toast.success('Resource is free!');
        return;
      }

      if (resp.status !== 402) throw new Error(`Unexpected status: ${resp.status}`);

      const body = await resp.json();
      if (!body.accepts?.length) throw new Error('No payment options in 402');

      setPaymentOptions(body.accepts);
      setSelectedOption(body.accepts[0]);
      setStep('got402');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch');
      setStep('error');
    }
  };

  // Step 2: Pay (escrow or channel)
  const handlePay = async () => {
    if (!selectedOption || !isConnected || !address) return;
    const opt = selectedOption;
    const isChannel = opt.scheme === 'hathor-channel';

    try {
      setStep('creating');
      let id: string;

      if (isChannel) {
        // Create a new channel with 10x the per-request amount
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const deposit = parseInt(opt.price) * 10;
        toast.info('Confirm the channel deposit in your wallet...');

        const result = await sendNanoContractTx({
          network, blueprint_id: opt.extra.channelBlueprintId, method: 'initialize',
          args: [opt.extra.facilitatorAddress, opt.asset, deadline],
          actions: [{ type: 'deposit', amount: String(deposit), token: opt.asset }],
          push_tx: true,
        });
        id = result?.response?.hash || result?.hash || result?.response?.response?.hash;
        if (!id) throw new Error('No tx hash');
        storeChannel(id);
        setActiveChannel(id);
        toast.success(`Channel created: ${id.slice(0, 12)}...`);
      } else {
        // Create a one-shot escrow
        const deadline = Math.floor(Date.now() / 1000) + opt.extra.deadlineSeconds;
        toast.info('Confirm the escrow deposit in your wallet...');

        const result = await sendNanoContractTx({
          network, blueprint_id: opt.extra.blueprintId, method: 'initialize',
          args: [opt.payTo, opt.extra.facilitatorAddress, opt.asset, deadline, opt.resource, 'dapp-x402'],
          actions: [{ type: 'deposit', amount: opt.price, token: opt.asset }],
          push_tx: true,
        });
        id = result?.response?.hash || result?.hash || result?.response?.response?.hash;
        if (!id) throw new Error('No tx hash');
        await addEscrow(id);
        toast.success(`Escrow created: ${id.slice(0, 12)}...`);
      }

      setContractId(id);

      // Wait for confirmation
      setStep('waiting_confirmation');
      await waitForConfirmation(id);

      // Retry with payment proof
      setStep('retrying');
      const paymentPayload = isChannel
        ? { x402Version: 2, scheme: 'hathor-channel', network: `hathor:${network}`, payload: { channelId: id, buyerAddress: address } }
        : { x402Version: 2, scheme: 'hathor-escrow', network: `hathor:${network}`, payload: { ncId: id, depositTxId: id, buyerAddress: address } };

      const paidResp = await fetch(url, { mode: 'cors', headers: { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(paymentPayload)) } });
      if (!paidResp.ok) {
        const errBody = await paidResp.json().catch(() => ({}));
        throw new Error(errBody.reason || errBody.error || `Rejected: ${paidResp.status}`);
      }

      const data = await paidResp.json();
      setResourceData(data);
      setStep('done');
      toast.success('Resource received!');
      addToHistory(opt.scheme, id, opt.price);
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
    throw new Error('Confirmation timeout (60s)');
  };

  const amountDisplay = selectedOption ? `${(parseInt(selectedOption.price) / 100).toFixed(2)} HTR` : '';
  const isChannel = selectedOption?.scheme === 'hathor-channel';

  return (
    <div className="space-y-6">
      {/* Active Channel Banner */}
      {activeChannel && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-green-400 font-medium">Active Payment Channel</span>
            <p className="text-xs text-slate-400 font-mono mt-1">{formatAddress(activeChannel)}</p>
            <p className="text-xs text-slate-500">Requests will be paid instantly — no wallet confirmation needed</p>
          </div>
          <button
            onClick={() => { clearStoredChannel(); setActiveChannel(null); toast.info('Channel disconnected'); }}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors px-3 py-1 border border-slate-600 rounded"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* URL Input */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-2">Access a Paid Resource</h3>
        <p className="text-sm text-slate-400 mb-4">
          {activeChannel
            ? 'Your channel will pay instantly — no wallet popup.'
            : 'Enter an x402-enabled URL. Choose escrow (per-request) or channel (pre-funded).'}
        </p>

        <div className="flex gap-3">
          <input
            type="text" value={url} onChange={e => setUrl(e.target.value)}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono text-sm"
            disabled={step !== 'idle' && step !== 'error' && step !== 'done'}
          />
          <button
            onClick={step === 'idle' || step === 'error' || step === 'done' ? handleFetch : undefined}
            disabled={!url || (step !== 'idle' && step !== 'error' && step !== 'done')}
            className="px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            style={{ background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)', color: '#0f172a' }}
          >
            Fetch
          </button>
        </div>
      </div>

      {/* Fetching */}
      {step === 'fetching' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-amber-400 text-lg">Fetching resource...</div>
        </div>
      )}

      {/* Got 402 — payment options */}
      {step === 'got402' && selectedOption && (
        <div className="bg-slate-800 rounded-xl border border-amber-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">💰</span>
            <div>
              <h3 className="text-lg font-bold text-amber-400">402 — Payment Required</h3>
              <p className="text-sm text-slate-400">Choose how to pay</p>
            </div>
          </div>

          {/* Option selector */}
          <div className="flex gap-2 mb-4">
            {paymentOptions.map((opt, i) => {
              const isCh = opt.scheme === 'hathor-channel';
              return (
                <button key={i} onClick={() => setSelectedOption(opt)}
                  className={`flex-1 px-3 py-3 rounded-lg text-sm border transition-colors text-left ${
                    selectedOption === opt ? 'border-amber-500 bg-amber-500/20 text-amber-400' : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                  }`}>
                  <div className="font-medium">{isCh ? '⚡ Channel' : '🔒 Escrow'}</div>
                  <div className="text-xs mt-1 opacity-70">{isCh ? 'Instant after setup' : 'One-shot per request'}</div>
                </button>
              );
            })}
          </div>

          {/* Details */}
          <div className="bg-slate-900 rounded-lg p-4 space-y-2 mb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Per request</span>
              <span className="text-white font-bold">{amountDisplay}</span>
            </div>
            {isChannel && (
              <div className="flex justify-between">
                <span className="text-slate-400">Channel deposit (10 requests)</span>
                <span className="text-white font-bold">{(parseInt(selectedOption.price) * 10 / 100).toFixed(2)} HTR</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Seller</span>
              <span className="text-white font-mono text-xs">{formatAddress(selectedOption.payTo)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">After this</span>
              <span className={isChannel ? 'text-green-400' : 'text-slate-400'}>
                {isChannel ? 'Next 9 requests are instant' : 'Each request needs a new escrow'}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handlePay} disabled={!isConnected}
              className="flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ background: isConnected ? 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)' : '#475569', color: '#0f172a' }}>
              {!isConnected ? 'Connect Wallet First'
                : isChannel ? `Open Channel (${(parseInt(selectedOption.price) * 10 / 100).toFixed(2)} HTR)`
                : `Pay ${amountDisplay}`}
            </button>
            <button onClick={reset} className="px-4 py-3 rounded-lg text-slate-400 hover:text-white border border-slate-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Creating */}
      {step === 'creating' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">{isChannel ? 'Creating channel...' : 'Creating escrow...'}</div>
          <p className="text-slate-400 text-sm">Confirm the deposit in your wallet</p>
        </div>
      )}

      {/* Waiting confirmation */}
      {step === 'waiting_confirmation' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Waiting for on-chain confirmation...</div>
          <p className="text-slate-400 text-sm font-mono">{contractId?.slice(0, 20)}...</p>
          <p className="text-xs text-slate-500 mt-2">~8-16 seconds</p>
        </div>
      )}

      {/* Retrying */}
      {step === 'retrying' && (
        <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6 text-center">
          <div className="text-green-400 text-lg mb-2">Payment verified! Fetching resource...</div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && resourceData && (
        <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">✅</span>
            <div>
              <h3 className="text-lg font-bold text-green-400">Resource Received</h3>
              {contractId && <p className="text-sm text-slate-400">Via {formatAddress(contractId)}</p>}
            </div>
          </div>
          <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
            {JSON.stringify(resourceData.data || resourceData, null, 2)}
          </pre>
          <button onClick={reset} className="mt-4 px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors">
            {activeChannel ? 'Fetch again (instant)' : 'Make another request'}
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="bg-slate-800 rounded-xl border border-red-500/50 p-6">
          <h3 className="text-lg font-bold text-red-400 mb-2">Error</h3>
          <p className="text-slate-300 text-sm mb-4">{error}</p>
          <button onClick={reset} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors">Try again</button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Payment History</h3>
          <div className="space-y-2">
            {history.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                <div>
                  <p className="text-white text-sm font-mono">{e.url}</p>
                  <p className="text-xs text-slate-500">{e.timestamp.toLocaleTimeString()} — {formatAddress(e.contractId)}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${e.scheme === 'hathor-channel' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {e.scheme === 'hathor-channel' ? 'channel' : 'escrow'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
