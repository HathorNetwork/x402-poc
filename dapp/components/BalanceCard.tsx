'use client';

import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import { useUnifiedWallet } from '@/contexts/UnifiedWalletContext';
import { formatBalanceWithCommas } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface BalanceCardProps {
  selectedToken: string;
}

export default function BalanceCard({ selectedToken }: BalanceCardProps) {
  const { balance, walletBalance, balanceVerified, isLoadingBalance, refreshBalance } = useWallet();
  const { isConnected, getContractStateForToken, network } = useHathor();
  const { walletType } = useUnifiedWallet();

  const handleLoadBalance = () => {
    // Only show confirmation toast for WalletConnect (not MetaMask Snap)
    if (walletType !== 'metamask') {
      toast.info('Please confirm the operation in your wallet...');
    }
    const tokenUid = getContractStateForToken(selectedToken)?.token_uid || '00';
    refreshBalance(tokenUid, network);
  };

  if (!isConnected) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 mb-6">
        <div className="text-lg font-bold text-white mb-4">
          YOUR BALANCE
        </div>
        <p className="text-slate-400">Connect your wallet to view balance</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 mb-6">
      <div className="text-lg font-bold text-white mb-4">
        YOUR BALANCE
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Wallet Balance:</span>
          {balanceVerified && balance > 0n ? (
            <span className="text-white font-medium">
              {formatBalanceWithCommas(balance)} {selectedToken}
            </span>
          ) : isLoadingBalance ? (
            <span className="text-slate-400 text-sm">Loading...</span>
          ) : (
            <button
              onClick={handleLoadBalance}
              className="px-3 py-1 font-medium rounded transition-colors hover:opacity-90 text-sm"
              style={{ background: 'linear-gradient(244deg, rgb(255, 166, 0) 0%, rgb(255, 115, 0) 100%)', color: '#1e293b' }}
            >
              Load Balance
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
