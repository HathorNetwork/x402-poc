'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import { useMetaMask } from '@/contexts/MetaMaskContext';
import { useHathor } from '@/contexts/HathorContext';
import { useState, useEffect } from 'react';

interface WalletConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletConnectionModal({ open, onOpenChange }: WalletConnectionModalProps) {
  const { connect: connectWalletConnect, isInitializing } = useWalletConnect();
  const { connect: connectMetaMask, isInstalled: isMetaMaskInstalled } = useMetaMask();
  const { network } = useHathor();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<'reown' | 'metamask' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setIsConnecting(false);
      setConnectingWallet(null);
      setError(null);
    }
  }, [open]);

  const handleReownConnect = async () => {
    try {
      setIsConnecting(true);
      setConnectingWallet('reown');
      setError(null);
      await connectWalletConnect(network);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to connect via Reown:', error);
      if (error?.message?.includes('not initialized yet')) {
        setError('Wallet is initializing. Please wait a moment and try again.');
      } else if (error?.message?.includes('User closed the modal')) {
        setError(null); // User intentionally closed, don't show error
      } else if (error?.message?.includes('Network mismatch')) {
        setError(error.message); // Show the full network mismatch error
      } else {
        setError('Failed to connect. Please try again.');
      }
    } finally {
      setIsConnecting(false);
      setConnectingWallet(null);
    }
  };

  const handleMetamaskConnect = async () => {
    if (!isMetaMaskInstalled) {
      setError('MetaMask is not installed. Please install MetaMask extension first.');
      return;
    }

    try {
      setIsConnecting(true);
      setConnectingWallet('metamask');
      setError(null);
      await connectMetaMask(network);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to connect via MetaMask:', error);
      if (error?.message?.includes('not installed')) {
        setError('MetaMask is not installed. Please install MetaMask extension first.');
      } else if (error?.message?.includes('User rejected')) {
        setError(null); // User intentionally rejected, don't show error
      } else {
        setError(error?.message || 'Failed to connect to MetaMask. Please try again.');
      }
    } finally {
      setIsConnecting(false);
      setConnectingWallet(null);
    }
  };

  const isReownButtonDisabled = isConnecting || isInitializing;
  const isMetaMaskButtonDisabled = isConnecting || !isMetaMaskInstalled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose your preferred wallet connection method
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {isInitializing && (
            <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3 text-sm text-blue-400">
              Initializing wallet connection...
            </div>
          )}
          <Button
            onClick={handleReownConnect}
            className="w-full flex items-center justify-center gap-2"
            variant="outline"
            disabled={isReownButtonDisabled}
          >
            {connectingWallet === 'reown' ? 'Connecting...' : isInitializing ? 'Initializing...' : 'Connect via Reown'}
          </Button>
          <Button
            onClick={handleMetamaskConnect}
            className="w-full flex items-center justify-center gap-2"
            variant="outline"
            disabled={isMetaMaskButtonDisabled}
          >
            {connectingWallet === 'metamask' ? 'Connecting...' : !isMetaMaskInstalled ? 'Install MetaMask First' : 'Connect via MetaMask Snaps'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
