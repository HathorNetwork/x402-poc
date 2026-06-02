'use client';

import { useEffect, useState } from 'react';
import { useHathor } from '@/contexts/HathorContext';
import Header from '@/components/Header';
import { formatAddress } from '@/lib/utils';
import { getPayment, markVoided, PaymentRecord } from '@/lib/paymentHistory';

interface PageProps {
  params: { txId: string };
}

function describeAmount(atomicStr?: string) {
  if (!atomicStr) return '';
  const n = parseInt(atomicStr, 10);
  if (!Number.isFinite(n)) return atomicStr;
  return `${(n / 100).toFixed(2)} HTR`;
}

export default function PaymentDetailPage({ params }: PageProps) {
  const { txId } = params;
  const { coreAPI } = useHathor();
  const [record, setRecord] = useState<PaymentRecord | undefined>(() => getPayment(txId));
  const [tx, setTx] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    coreAPI
      .getTransaction(txId)
      .then((data) => {
        if (cancelled) return;
        if (!data?.success) {
          setError('Transaction not found at fullnode');
          setLoading(false);
          return;
        }
        setTx(data.tx);
        setMeta(data.meta || null);

        // If the chain reports the tx voided, update local record so the
        // history badge reflects reality.
        if (Array.isArray(data.meta?.voided_by) && data.meta.voided_by.length > 0) {
          markVoided(txId);
          setRecord(getPayment(txId));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load transaction');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coreAPI, txId]);

  const payOutputIndex = (() => {
    if (!tx?.outputs || !record) return -1;
    return tx.outputs.findIndex(
      (o: any) =>
        o.decoded?.address === record.payTo &&
        BigInt(o.value) >= BigInt(parseInt(record.amount, 10) || 0)
    );
  })();

  const voided = Array.isArray(meta?.voided_by) && meta.voided_by.length > 0;
  const conflicted = Array.isArray(meta?.conflict_with) && meta.conflict_with.length > 0;

  return (
    <div className="min-h-screen bg-slate-900">
      <Header appName="x402 Client" />

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        <a href="/" className="text-sm text-amber-400 hover:underline">
          ← back
        </a>

        <h1 className="text-3xl font-bold text-white mt-4 mb-2">Payment</h1>
        <p className="text-slate-400 text-sm font-mono break-all mb-6">{txId}</p>

        {loading && <div className="text-slate-400">Loading...</div>}

        {error && (
          <div className="bg-slate-800 border border-red-500/50 rounded-xl p-6 text-red-400">
            {error}
          </div>
        )}

        {!loading && tx && (
          <>
            {/* Local record */}
            {record && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
                <h2 className="text-lg font-bold text-white mb-3">Local record</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">URL:</span>{' '}
                    <span className="text-slate-200 font-mono break-all">{record.url}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Scheme:</span>{' '}
                    <span className="text-slate-200">{record.scheme}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Pay to:</span>{' '}
                    <span className="text-slate-200 font-mono">{formatAddress(record.payTo)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Payer:</span>{' '}
                    <span className="text-slate-200 font-mono">
                      {formatAddress(record.payerAddress)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Amount paid:</span>{' '}
                    <span className="text-white font-bold">{describeAmount(record.amount)}</span>
                  </div>
                  {record.chargedAmount != null && (
                    <div>
                      <span className="text-slate-500">Charged:</span>{' '}
                      <span className="text-amber-400 font-bold">
                        {describeAmount(record.chargedAmount)}
                      </span>
                    </div>
                  )}
                  {record.refundAmount != null && parseInt(record.refundAmount, 10) > 0 && (
                    <div>
                      <span className="text-slate-500">Refunded:</span>{' '}
                      <span className="text-green-400 font-bold">
                        {describeAmount(record.refundAmount)}
                      </span>
                    </div>
                  )}
                  {record.refundTxId && (
                    <div>
                      <span className="text-slate-500">Refund tx:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {formatAddress(record.refundTxId)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Status:</span>{' '}
                    <span
                      className={
                        record.status === 'voided' ? 'text-red-400' : 'text-green-400'
                      }
                    >
                      {record.status}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* On-chain status */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-3">On-chain status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">first_block:</span>{' '}
                  {meta?.first_block ? (
                    <span className="text-green-400 font-mono">
                      {formatAddress(meta.first_block)}
                    </span>
                  ) : (
                    <span className="text-amber-400">unconfirmed (mempool)</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">voided_by:</span>{' '}
                  {voided ? (
                    <span className="text-red-400">{meta.voided_by.length} tx(s)</span>
                  ) : (
                    <span className="text-slate-300">none</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">conflict_with:</span>{' '}
                  {conflicted ? (
                    <span className="text-red-400">{meta.conflict_with.length} tx(s)</span>
                  ) : (
                    <span className="text-slate-300">none</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">accumulated_weight:</span>{' '}
                  <span className="text-slate-300">
                    {meta?.accumulated_weight ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-3">Outputs</h2>
              <div className="space-y-2">
                {tx.outputs?.map((o: any, i: number) => (
                  <div
                    key={i}
                    className={`bg-slate-900 rounded p-3 text-sm font-mono ${
                      i === payOutputIndex
                        ? 'border border-amber-500/60'
                        : 'border border-slate-700'
                    }`}
                  >
                    <span className="text-slate-500 mr-2">#{i}</span>
                    <span className="text-white">{o.value} cents</span>
                    {o.decoded?.address && (
                      <span className="text-slate-400 ml-3">→ {formatAddress(o.decoded.address)}</span>
                    )}
                    {i === payOutputIndex && (
                      <span className="ml-3 text-xs text-amber-400">[paying output]</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-bold text-white mb-3">Inputs</h2>
              <div className="space-y-2">
                {tx.inputs?.map((inp: any, i: number) => (
                  <div
                    key={i}
                    className="bg-slate-900 rounded p-3 text-sm font-mono border border-slate-700"
                  >
                    <span className="text-slate-500 mr-2">#{i}</span>
                    <span className="text-slate-300 break-all">
                      {formatAddress(inp.tx_id || '')}:{inp.index}
                    </span>
                    {inp.decoded?.address && (
                      <span className="text-slate-400 ml-3">
                        ({formatAddress(inp.decoded.address)})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
