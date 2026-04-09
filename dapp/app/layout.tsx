import type { Metadata } from 'next';
import { WalletProvider } from '@/contexts/WalletContext';
import { HathorProvider } from '@/contexts/HathorContext';
import { WalletConnectProvider } from '@/contexts/WalletConnectContext';
import { MetaMaskProvider } from '@/contexts/MetaMaskContext';
import { UnifiedWalletProvider } from '@/contexts/UnifiedWalletContext';
import { ToastProvider, Toaster } from '@/lib/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'x402 Escrow Manager',
  description: 'Manage x402 payment escrows on Hathor Network',
  icons: {
    icon: '/images/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ToastProvider>
          <WalletConnectProvider>
            <MetaMaskProvider>
              <UnifiedWalletProvider>
                <WalletProvider>
                  <HathorProvider>
                    {children}
                    <Toaster />
                  </HathorProvider>
                </WalletProvider>
              </UnifiedWalletProvider>
            </MetaMaskProvider>
          </WalletConnectProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
