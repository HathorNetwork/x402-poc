'use client';

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import Header from '@/components/Header';
import BalanceCard from '@/components/BalanceCard';
import { WalletConnectionModal } from '@/components/WalletConnectionModal';
import { X402Fetch } from '@/components/X402Fetch';
import { formatAddress } from '@/lib/utils';

export default function Home() {
  const { address } = useWallet();
  const { network, isConnected } = useHathor();
  const [showWalletModal, setShowWalletModal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900">
      <Header appName="x402 Client" selectedToken="HTR" onTokenChange={() => {}} />

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-3">x402 Payment Client</h2>
          <p className="text-slate-400 text-lg">
            Access paid HTTP APIs on Hathor Network. Enter a URL, pay with your wallet, get the data.
          </p>
        </div>

        {/* Wallet bar */}
        <div className="flex items-center justify-between bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
          {isConnected ? (
            <>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <div className="text-sm">
                  <span className="text-slate-400">Connected: </span>
                  <span className="text-white font-mono">{formatAddress(address || '')}</span>
                  <span className="text-slate-500 ml-2">({network})</span>
                </div>
              </div>
              <BalanceCard selectedToken="HTR" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                <span className="text-slate-400 text-sm">Wallet not connected</span>
              </div>
              <button
                onClick={() => setShowWalletModal(true)}
                className="px-5 py-2 rounded-lg font-medium text-sm transition-colors hover:opacity-90"
                style={{ background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)', color: '#0f172a' }}
              >
                Connect Wallet
              </button>
            </>
          )}
        </div>

        {/* x402 Fetch Flow */}
        <X402Fetch />

        {/* How it works */}
        <div className="mt-8 bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">How x402 Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            {[
              { step: '1', title: 'Fetch', desc: 'Request a paid API endpoint' },
              { step: '2', title: '402', desc: 'Server responds with payment requirements' },
              { step: '3', title: 'Pay', desc: 'Deposit funds into an escrow contract' },
              { step: '4', title: 'Access', desc: 'Retry with proof — get the data' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="p-3">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-900 font-bold flex items-center justify-center mx-auto mb-2">{step}</div>
                <p className="text-white font-medium">{title}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <WalletConnectionModal
        open={showWalletModal}
        onOpenChange={setShowWalletModal}
      />
    </div>
  );
}
