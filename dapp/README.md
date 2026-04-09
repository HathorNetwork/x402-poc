# create-hathor-dapp

A template for building decentralized applications on the Hathor Network using Nano Contracts. This template provides wallet integration with MetaMask Snaps and Reown (WalletConnect), network switching, and all the infrastructure you need to build your dApp.

## Features

- **Wallet Integration**: Connect via Reown (WalletConnect) or MetaMask Snaps
- **Network Support**: Testnet and Mainnet support with easy switching
- **Nano Contract Support**: Ready-to-use infrastructure for interacting with nano contracts
- **Contract State Viewing**: Display and refresh contract state data
- **Balance Management**: View wallet balances with authorization
- **Mock Mode**: Test the UI without connecting a real wallet
- **Modern Stack**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Testing**: Unit tests with Vitest, E2E tests with Playwright

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Hathor wallet (Hathor Wallet or MetaMask with Hathor Snap)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd create-hathor-dapp
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` with your configuration:
   - Get a WalletConnect Project ID from https://cloud.walletconnect.com/
   - Add your nano contract IDs
   - Set your preferred default network

5. Run development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Configuration

```env
# WalletConnect Project ID (Required)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Network Configuration
NEXT_PUBLIC_DEFAULT_NETWORK=testnet
NEXT_PUBLIC_USE_MOCK_WALLET=false

# Contract IDs (JSON array format)
NEXT_PUBLIC_CONTRACT_IDS_TESTNET=["your_contract_id"]
NEXT_PUBLIC_CONTRACT_IDS_MAINNET=[]

# App Metadata
NEXT_PUBLIC_APP_NAME=Your dApp Name
NEXT_PUBLIC_APP_DESCRIPTION=Your dApp description
```

## Architecture

### Core Infrastructure

1. **Hathor RPC Service** (`lib/hathorRPC.ts`)
   - Implements the Hathor wallet-to-DApp RPC API
   - Supports mock mode, MetaMask Snaps, and WalletConnect
   - Methods: `htr_getConnectedNetwork`, `htr_getBalance`, `htr_getAddress`, `htr_sendNanoContractTx`

2. **Hathor Core API** (`lib/hathorCoreAPI.ts`)
   - Fetches blockchain data from Hathor nodes
   - Methods: `getBlueprintInfo`, `getContractState`, `getContractHistory`, `getTransaction`, `callViewFunction`

3. **Context Providers**
   - `MetaMaskContext`: MetaMask Snaps integration
   - `WalletConnectContext`: Reown/WalletConnect integration
   - `UnifiedWalletContext`: Unified wallet adapter pattern
   - `WalletContext`: Balance and transaction management
   - `HathorContext`: Contract state and network management

### Project Structure

```
create-hathor-dapp/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Main page
│   └── globals.css         # Global styles
├── components/
│   ├── Header.tsx          # Header with wallet connection
│   ├── BalanceCard.tsx     # Balance display
│   ├── ContractInfoPanel.tsx # Contract state display
│   ├── NetworkSelector.tsx # Network switching
│   ├── TokenSelector.tsx   # Token selection
│   ├── WalletConnectionModal.tsx # Wallet connection
│   └── ui/                 # Reusable UI components
├── contexts/
│   ├── HathorContext.tsx   # Hathor network & contract state
│   ├── WalletContext.tsx   # Wallet state management
│   ├── MetaMaskContext.tsx # MetaMask Snaps integration
│   ├── WalletConnectContext.tsx # WalletConnect integration
│   └── UnifiedWalletContext.tsx # Unified wallet adapter
├── lib/
│   ├── config.ts           # Environment configuration
│   ├── hathorRPC.ts        # RPC service
│   ├── hathorCoreAPI.ts    # Core API service
│   ├── utils.ts            # Utility functions
│   ├── toast.tsx           # Toast notifications
│   └── walletConnectConfig.ts # WalletConnect setup
├── types/
│   ├── hathor.ts           # Hathor types
│   ├── wallet.ts           # Wallet adapter types
│   └── index.ts            # Common types
├── __tests__/              # Unit and integration tests
├── e2e/                    # End-to-end tests
└── __mocks__/              # Test mocks
```

## Using the Template

### Sending Nano Contract Transactions

```typescript
import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';

function YourComponent() {
  const { sendNanoContractTx } = useWallet();
  const { network, getContractIdForToken, getContractStateForToken } = useHathor();

  const handleTransaction = async () => {
    const contractId = getContractIdForToken('HTR');
    const contractState = getContractStateForToken('HTR');
    const tokenUid = contractState?.token_uid || '00';

    const result = await sendNanoContractTx({
      network,
      nc_id: contractId,
      method: 'your_method_name',
      args: [arg1, arg2],
      actions: [
        {
          type: 'deposit',
          amount: '1000', // in cents
          token: tokenUid,
        },
      ],
      push_tx: true,
    });

    console.log('Transaction hash:', result.response.hash);
  };

  return <button onClick={handleTransaction}>Send Transaction</button>;
}
```

### Reading Contract State

```typescript
import { useHathor } from '@/contexts/HathorContext';

function ContractStateDisplay() {
  const { getContractStateForToken, coreAPI } = useHathor();

  const contractState = getContractStateForToken('HTR');

  // Or fetch directly from API
  const fetchState = async () => {
    const state = await coreAPI.getContractState('your-contract-id');
    console.log(state);
  };

  return (
    <div>
      <p>Available Tokens: {contractState?.available_tokens.toString()}</p>
    </div>
  );
}
```

### Adding New Pages

Create new pages in the `app/` directory following Next.js App Router conventions:

```typescript
// app/your-page/page.tsx
'use client';

import { useHathor } from '@/contexts/HathorContext';
import Header from '@/components/Header';

export default function YourPage() {
  const { isConnected } = useHathor();

  return (
    <div className="min-h-screen bg-slate-900">
      <Header selectedToken="HTR" onTokenChange={() => {}} />
      <main className="container mx-auto px-6 py-8">
        {/* Your page content */}
      </main>
    </div>
  );
}
```

## Development

### Mock Mode

For testing without a wallet:
```env
NEXT_PUBLIC_USE_MOCK_WALLET=true
```

Mock mode simulates:
- Wallet connection
- Balance queries
- Transaction submissions
- Network information

### Running Tests

```bash
# Unit tests
npm test

# Unit tests with UI
npm run test:ui

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui
```

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## API Reference

### Hathor RPC Methods

| Method | Description |
|--------|-------------|
| `htr_getConnectedNetwork()` | Get the network the wallet is connected to |
| `htr_getBalance(params)` | Get balance for specified tokens |
| `htr_getAddress(params)` | Get wallet address |
| `htr_sendNanoContractTx(params)` | Send a nano contract transaction |

### Hathor Core API Methods

| Method | Description |
|--------|-------------|
| `getBlueprintInfo(blueprintId)` | Fetch blueprint information |
| `getContractState(contractId)` | Fetch current contract state |
| `getContractHistory(contractId, limit)` | Fetch contract transaction history |
| `getTransaction(txId)` | Fetch transaction details |
| `callViewFunction(contractId, method, args)` | Call a view function |
| `getClaimableBalance(contractId, address)` | Get claimable balance for an address |

## Troubleshooting

### Wallet Not Connecting

1. Ensure you're on the correct network (testnet/mainnet)
2. Check that your wallet extension is installed and unlocked
3. Try refreshing the page
4. Check browser console for errors

### Contract State Not Loading

1. Check network configuration in `.env.local`
2. Verify contract ID is correct
3. Ensure node URL is accessible
4. Check browser console for API errors

### Transaction Failing

1. Verify sufficient balance
2. Check transaction parameters
3. Ensure contract has sufficient liquidity
4. Verify network connection

## Resources

- [Hathor Documentation](https://docs.hathor.network)
- [Wallet API Reference](https://docs.hathor.network/guides/headless-wallet/http-api/)
- [Nano Contracts Guide](https://docs.hathor.network/guides/nano-contracts/)
- [Hathor Discord](https://discord.gg/hathor)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

---

Built with Hathor Network
