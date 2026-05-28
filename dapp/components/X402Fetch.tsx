'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { config } from '@/lib/config';
import { HathorRPCService } from '@/lib/hathorRPC';
import { toast } from '@/lib/toast';
import { formatAddress } from '@/lib/utils';
import { addPayment, getPayments, PaymentRecord } from '@/lib/paymentHistory';

// --- types -----------------------------------------------------------------

interface PaymentOption {
  scheme: 'hathor-direct' | 'hathor-direct-upto' | string;
  network: string;
  asset: string;
  amount: string;
  description?: string;
  resource: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra: {
    requestId: string;
    facilitatorUrl?: string;
  };
}

type Step =
  | 'idle'
  | 'fetching'
  | 'got402'
  | 'confirming_send'
  | 'waiting_mempool'
  | 'signing'
  | 'retrying'
  | 'done'
  | 'error';

// --- helpers ---------------------------------------------------------------

async function pollMempool(nodeUrl: string, txId: string, maxAttempts = 30): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(`${nodeUrl}/transaction?id=${encodeURIComponent(txId)}`);
      const data = await resp.json();
      if (data?.success) return data;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Transaction not visible at fullnode after 30s');
}

function getInputAddresses(tx: any): Set<string> {
  const addrs = new Set<string>();
  for (const inp of tx?.inputs || []) {
    const a = inp?.decoded?.address;
    if (a) addrs.add(a);
  }
  return addrs;
}

function describeAmount(atomicStr: string) {
  const n = parseInt(atomicStr, 10);
  if (!Number.isFinite(n)) return atomicStr;
  return `${(n / 100).toFixed(2)} HTR`;
}

function describeScheme(scheme: string) {
  if (scheme === 'hathor-direct-upto') return 'upto';
  if (scheme === 'hathor-direct') return 'direct';
  return scheme;
}

// --- component -------------------------------------------------------------

export function X402Fetch() {
  const { sendTransaction, signWithAddress, getUtxos, address } = useWallet();
  const { network, isConnected } = useHathor();

  const [url, setUrl] = useState(config.defaultDemoUrl);
  const [step, setStep] = useState<Step>('idle');
  const [accept, setAccept] = useState<PaymentOption | null>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>(() => getPayments());

  const reset = () => {
    setStep('idle');
    setAccept(null);
    setResourceData(null);
    setPaymentInfo(null);
    setError(null);
    setTxId(null);
  };

  // Step 1: GET → expect 402
  const handleFetch = async () => {
    reset();
    setStep('fetching');
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (r.ok) {
        setResourceData(await r.json());
        setStep('done');
        toast.success('Resource is free!');
        return;
      }
      if (r.status !== 402) throw new Error(`Unexpected status ${r.status}`);
      const body = await r.json();
      if (!body?.accepts?.length) throw new Error('No accepts in 402 body');
      setAccept(body.accepts[0]);
      setStep('got402');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  // Step 2: send tx, sign requestId, retry
  const handlePay = async () => {
    if (!accept || !isConnected || !address) return;
    const opt = accept;

    try {
      // We assume the wallet shared address-0 (its first address) at connect
      // time — true for WalletConnect/Reown's session approval flow (see
      // hathor-wallet/src/sagas/reown.js:184). To make the on-chain tx's
      // input(s) provably belong to address-0, we explicitly fetch UTXOs
      // filtered to that address and hand them to htr_sendTransaction as
      // `inputs`. The wallet then *must* use only those UTXOs, so every
      // input address in the resulting tx is address-0, and signing with
      // addressIndex: 0 produces a signature the verifier accepts.
      const PAYER_INDEX = 0;
      // Address-0 is what WalletConnect shares at session approval
      // (hathor-wallet/src/sagas/reown.js:184 derives `getAddressAtIndex(0)`),
      // so the connected address is address-0 by definition. We use it both
      // as the FROM (filter UTXOs to spend) and as the change recipient so
      // address-0 keeps being funded for subsequent payments.
      if (!address) throw new Error('Wallet not connected');
      const payerAddress = address;
      const amount = parseInt(String(opt.amount).replace(/[^0-9]/g, ''), 10);

      // Step 1: list the connected address's UTXOs (asset-filtered).
      setStep('confirming_send');
      toast.info('Listing your UTXOs at address-0...');
      const utxoDetails = await getUtxos({
        network,
        filterAddress: payerAddress,
        token: opt.asset || '00',
        onlyAvailableUtxos: true,
        maxUtxos: 255,
      });
      const available = (utxoDetails?.utxos || [])
        .filter((u) => !u.locked)
        .map((u) => ({ ...u, _amt: Number(u.amount) }))
        .sort((a, b) => b._amt - a._amt); // largest first → fewer inputs

      // Greedy-pick enough UTXOs to cover the payment.
      const chosen: typeof available = [];
      let total = 0;
      for (const u of available) {
        chosen.push(u);
        total += u._amt;
        if (total >= amount) break;
      }
      if (total < amount) {
        throw new Error(
          `Address-0 (${payerAddress.slice(0, 8)}...) has ${(total / 100).toFixed(2)} HTR available — need ${(amount / 100).toFixed(2)} HTR. Move funds to this address and retry.`
        );
      }

      toast.info('Confirm the payment in your wallet...');
      const sendOutput: any = {
        address: opt.payTo,
        // The wallet RPC validates `value` as a digit string (not a number).
        value: String(amount),
      };
      if (opt.asset && opt.asset !== '00') sendOutput.token = opt.asset;

      const sendResp = await sendTransaction({
        network,
        outputs: [sendOutput],
        inputs: chosen.map((u) => ({ txId: u.tx_id, index: u.index })),
        // ALWAYS route change to address-0 so it stays funded for future
        // payments. Otherwise the wallet defaults change to its
        // `first_empty` address and address-0 slowly drains.
        changeAddress: payerAddress,
        push_tx: true,
      });
      const sentTxId = HathorRPCService.extractTxId(sendResp);
      if (!sentTxId) throw new Error('Wallet did not return a transaction hash');
      setTxId(sentTxId);
      toast.success(`Payment broadcast — ${sentTxId.slice(0, 10)}...`);

      // Wait until our fullnode sees the tx — no need for first_block. Capture
      // the response so we can validate against the actual on-chain inputs.
      setStep('waiting_mempool');
      const mempoolResp = await pollMempool(config.hathorNodeUrls[network], sentTxId);
      const inputAddrs = getInputAddresses(mempoolResp?.tx);

      // Sign the server-issued requestId with address-0's key.
      setStep('signing');
      toast.info('Confirm the signature in your wallet...');
      const signed = await signWithAddress({
        network,
        message: opt.extra.requestId,
        addressIndex: PAYER_INDEX,
      });

      // Sanity check — with explicit UTXO selection all inputs *should* be
      // from address-0. If something else slipped in (wallet implementation
      // quirk), surface a precise error matching what the verifier will say.
      if (!inputAddrs.has(signed.address.address)) {
        throw new Error(
          `Signed address (${signed.address.address.slice(0, 8)}...) is not among this tx's input addresses ` +
            `[${[...inputAddrs].map((a) => a.slice(0, 8) + '...').join(', ')}]. ` +
            `Unexpected — the wallet didn't honour the explicit input list.`
        );
      }

      // Retry the original GET with the proof header.
      setStep('retrying');
      const payload = {
        x402Version: 2,
        scheme: opt.scheme,
        network: opt.network,
        payload: {
          txId: sentTxId,
          payerAddress: signed.address.address,
          signature: signed.signature,
          requestId: opt.extra.requestId,
        },
      };
      const headerB64 =
        typeof window !== 'undefined' && typeof window.btoa === 'function'
          ? window.btoa(JSON.stringify(payload))
          : Buffer.from(JSON.stringify(payload)).toString('base64');

      const paidResp = await fetch(url, {
        mode: 'cors',
        headers: { 'PAYMENT-SIGNATURE': headerB64 },
      });
      if (!paidResp.ok) {
        const errBody = await paidResp.json().catch(() => ({}));
        throw new Error(errBody.reason || errBody.error || `Rejected: ${paidResp.status}`);
      }
      const data = await paidResp.json();
      setResourceData(data?.data ?? data);
      setPaymentInfo(data?.payment ?? null);

      // Record locally for the history panel + /payment/[txId] page.
      const record: PaymentRecord = {
        txId: sentTxId,
        url,
        route: opt.resource,
        scheme: (opt.scheme as PaymentRecord['scheme']) || 'hathor-direct',
        amount: opt.amount,
        chargedAmount: data?.payment?.chargedAmount,
        refundAmount: data?.payment?.refundAmount,
        refundTxId: data?.payment?.refundTxId,
        asset: opt.asset,
        payTo: opt.payTo,
        payerAddress: signed.address.address,
        network: opt.network,
        status: 'served',
        ts: Date.now(),
      };
      addPayment(record);
      setHistory(getPayments());

      setStep('done');
      toast.success('Resource received!');
      // Intentionally NOT calling refreshBalance here — htr_getBalance
      // prompts the wallet on some adapters, which is noisy right after the
      // user just signed twice. The user can hit "Load Balance" on the
      // BalanceCard explicitly if they want a fresh number.
    } catch (err: any) {
      setError(err.message);
      setStep('error');
      toast.error(err.message);
    }
  };

  const isUpto = accept?.scheme === 'hathor-direct-upto';
  const amountLabel = accept ? describeAmount(accept.amount) : '';

  return (
    <div className="space-y-6">
      {/* URL input + presets */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-2">Access a paid resource</h3>
        <p className="text-sm text-slate-400 mb-4">
          Enter an x402-enabled URL. Click <span className="text-amber-400">Fetch</span> to load it.
          On 402, your wallet will sign a payment.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono text-sm"
            disabled={step !== 'idle' && step !== 'error' && step !== 'done'}
          />
          <button
            onClick={
              step === 'idle' || step === 'error' || step === 'done'
                ? handleFetch
                : undefined
            }
            disabled={!url || (step !== 'idle' && step !== 'error' && step !== 'done')}
            className="px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            style={{
              background:
                'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)',
              color: '#0f172a',
            }}
          >
            Fetch
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-slate-500 self-center">Try:</span>
          <button
            onClick={() => setUrl(`${config.resourceServerUrl}/weather`)}
            disabled={step !== 'idle' && step !== 'error' && step !== 'done'}
            className="text-xs px-3 py-1 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40"
          >
            🌤 /weather <span className="text-slate-500">(direct · 1.00 HTR)</span>
          </button>
          <button
            onClick={() => setUrl(`${config.resourceServerUrl}/generate`)}
            disabled={step !== 'idle' && step !== 'error' && step !== 'done'}
            className="text-xs px-3 py-1 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-blue-500 hover:text-blue-400 transition-colors disabled:opacity-40"
          >
            📊 /generate <span className="text-slate-500">(upto · up to 5.00 HTR)</span>
          </button>
        </div>
      </div>

      {/* Fetching */}
      {step === 'fetching' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
          <div className="text-amber-400 text-lg">Fetching resource...</div>
        </div>
      )}

      {/* Got 402 */}
      {step === 'got402' && accept && (
        <div className="bg-slate-800 rounded-xl border border-amber-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">💰</span>
            <div>
              <h3 className="text-lg font-bold text-amber-400">402 — Payment Required</h3>
              <p className="text-sm text-slate-400">
                Scheme: <span className="text-amber-400">{describeScheme(accept.scheme)}</span>
              </p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 space-y-2 mb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">{isUpto ? 'Max authorized' : 'Pay'}</span>
              <span className="text-white font-bold">
                {isUpto ? `up to ${amountLabel}` : amountLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Seller</span>
              <span className="text-white font-mono text-xs">{formatAddress(accept.payTo)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Network</span>
              <span className="text-slate-300">{accept.network}</span>
            </div>
            {accept.description && (
              <div className="flex justify-between">
                <span className="text-slate-400">Description</span>
                <span className="text-slate-300 text-right">{accept.description}</span>
              </div>
            )}
            {isUpto && (
              <div className="flex justify-between">
                <span className="text-slate-400">After</span>
                <span className="text-blue-400">
                  Server charges actual usage, remainder refunded
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePay}
              disabled={!isConnected}
              className="flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{
                background: isConnected
                  ? 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)'
                  : '#475569',
                color: '#0f172a',
              }}
            >
              {!isConnected
                ? 'Connect Wallet First'
                : isUpto
                  ? `Authorize up to ${amountLabel}`
                  : `Pay ${amountLabel}`}
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

      {/* In-flight steps */}
      {step === 'confirming_send' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Awaiting wallet confirmation...</div>
          <p className="text-slate-400 text-sm">Approve the payment in your wallet</p>
        </div>
      )}

      {step === 'waiting_mempool' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Waiting for the fullnode to see the tx...</div>
          {txId && <p className="text-slate-400 text-xs font-mono">{txId.slice(0, 24)}...</p>}
          <p className="text-xs text-slate-500 mt-2">~1–2 seconds</p>
        </div>
      )}

      {step === 'signing' && (
        <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-6 text-center">
          <div className="text-blue-400 text-lg mb-2">Awaiting signature...</div>
          <p className="text-slate-400 text-sm">Approve the message signature in your wallet</p>
        </div>
      )}

      {step === 'retrying' && (
        <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6 text-center">
          <div className="text-green-400 text-lg mb-2">Submitting payment proof...</div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && resourceData && (
        <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">✅</span>
            <div>
              <h3 className="text-lg font-bold text-green-400">Resource received</h3>
              {txId && (
                <p className="text-sm text-slate-400">
                  via tx{' '}
                  <a
                    href={`/payment/${txId}`}
                    className="text-amber-400 hover:underline font-mono"
                  >
                    {formatAddress(txId)}
                  </a>
                </p>
              )}
            </div>
          </div>

          {paymentInfo?.scheme === 'hathor-direct-upto' &&
            paymentInfo?.chargedAmount != null && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-blue-400 mb-2">📊 Upto settlement</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Max authorized</span>
                    <span className="text-white">{describeAmount(paymentInfo.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Charged</span>
                    <span className="text-amber-400 font-bold">
                      {describeAmount(paymentInfo.chargedAmount)}
                    </span>
                  </div>
                  {paymentInfo.refundAmount && parseInt(paymentInfo.refundAmount, 10) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Refunded</span>
                      <span className="text-green-400 font-bold">
                        {describeAmount(paymentInfo.refundAmount)}
                      </span>
                    </div>
                  )}
                  {paymentInfo.refundTxId && (
                    <div className="flex justify-between pt-1 border-t border-slate-700">
                      <span className="text-slate-400">Refund tx</span>
                      <span className="text-slate-300 font-mono text-xs">
                        {formatAddress(paymentInfo.refundTxId)}
                      </span>
                    </div>
                  )}
                  {paymentInfo.refundError && (
                    <div className="flex justify-between pt-1 border-t border-slate-700">
                      <span className="text-slate-400">Refund error</span>
                      <span className="text-red-400 text-xs">{paymentInfo.refundError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
            {JSON.stringify(resourceData, null, 2)}
          </pre>
          <button
            onClick={reset}
            className="mt-4 px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors"
          >
            Make another request
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="bg-slate-800 rounded-xl border border-red-500/50 p-6">
          <h3 className="text-lg font-bold text-red-400 mb-2">Error</h3>
          <p className="text-slate-300 text-sm mb-4">{error}</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Payment history</h3>
          <div className="space-y-2">
            {history.map((e) => {
              const badgeClass =
                e.scheme === 'hathor-direct-upto'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-amber-500/20 text-amber-400';
              const badgeLabel = describeScheme(e.scheme);
              const ts = new Date(e.ts);
              return (
                <a
                  key={e.txId}
                  href={`/payment/${e.txId}`}
                  className="flex items-center justify-between bg-slate-900 rounded-lg p-3 hover:bg-slate-700/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-mono truncate">{e.url}</p>
                    <p className="text-xs text-slate-500">
                      {ts.toLocaleTimeString()} — {formatAddress(e.txId)}
                      {e.chargedAmount != null && (
                        <span className="ml-2 text-blue-400">
                          charged {describeAmount(e.chargedAmount)}
                          {e.refundAmount && parseInt(e.refundAmount, 10) > 0 &&
                            ` · refunded ${describeAmount(e.refundAmount)}`}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${badgeClass}`}>{badgeLabel}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
