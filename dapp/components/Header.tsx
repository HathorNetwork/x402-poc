'use client';

import { useState } from 'react';
import { useHathor } from '@/contexts/HathorContext';
import { formatAddress } from '@/lib/utils';
import { WalletConnectionModal } from './WalletConnectionModal';
import { NetworkSelector } from './NetworkSelector';
import TokenSelector from './TokenSelector';

interface HeaderProps {
  selectedToken: string;
  onTokenChange: (token: string) => void;
  appName?: string;
}

export default function Header({ selectedToken, onTokenChange, appName = 'Hathor dApp' }: HeaderProps) {
  const { isConnected, address, disconnectWallet, network, switchNetwork } = useHathor();
  const [showModal, setShowModal] = useState(false);
  const [showDisconnectMenu, setShowDisconnectMenu] = useState(false);

  const handleConnect = async () => {
    setShowModal(true);
  };

  // Handle network change - disconnect wallet first if connected
  const handleNetworkChange = (newNetwork: typeof network) => {
    if (isConnected) {
      disconnectWallet();
    }
    switchNetwork(newNetwork);
  };

  return (
    <>
      <header className="flex items-center justify-between p-6 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{appName}</h1>
        </div>

        <div className="flex items-center gap-2">
          <NetworkSelector
            value={network}
            onChange={handleNetworkChange}
          />
          {isConnected ? (
            <>
              <TokenSelector selectedToken={selectedToken} onTokenChange={onTokenChange} />
              <div className="relative">
                <button
                  onClick={() => setShowDisconnectMenu(!showDisconnectMenu)}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-sm text-slate-300">{formatAddress(address || '')}</span>
                </button>
                {showDisconnectMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDisconnectMenu(false)} />
                    <div className="absolute top-full mt-2 right-0 z-50">
                      <button
                        onClick={() => {
                          disconnectWallet();
                          setShowDisconnectMenu(false);
                        }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors whitespace-nowrap"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className="px-6 py-2 rounded-lg font-medium transition-colors hover:opacity-90"
              style={{ background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)', color: '#0f172a' }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <WalletConnectionModal
        open={showModal}
        onOpenChange={setShowModal}
      />
    </>
  );
}
