# AGENTS.md — LLM Instructions for Hathor dApp

This document is the single source of truth for AI agents building dApps from this template. Follow it step by step.

## Quick Reference

| What | Where |
|------|-------|
| WalletConnect Project ID | `.env.local` → `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Contract IDs (testnet) | `.env.local` → `NEXT_PUBLIC_CONTRACT_IDS_TESTNET` |
| Contract IDs (mainnet) | `.env.local` → `NEXT_PUBLIC_CONTRACT_IDS_MAINNET` |
| App name & description | `.env.local` → `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_DESCRIPTION` |
| Default network | `.env.local` → `NEXT_PUBLIC_DEFAULT_NETWORK` |
| Mock mode (no wallet) | `.env.local` → `NEXT_PUBLIC_USE_MOCK_WALLET=true` |
| Main page | `app/page.tsx` |
| Add new pages | `app/your-page/page.tsx` |
| Add components | `components/` |
| Contract state types | `types/hathor.ts` → `ContractState` |
| Contract state fields | `lib/hathorCoreAPI.ts` → `getContractState()` |
| Page title & metadata | `app/layout.tsx` → `metadata` |
| Header app name | `app/page.tsx` → `<Header appName="...">` |
| WalletConnect metadata | `lib/walletConnectConfig.ts` |
| App icon | `public/images/icon.png` |
| Favicon | `public/favicon.png` |

## Step 1: Configure Environment

The `.env.local` file controls all runtime configuration. Edit it directly — do not modify `lib/config.ts` unless adding new env vars.

```env
# REQUIRED: Get from https://cloud.walletconnect.com/
# Create a project → copy the Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Network: 'testnet' or 'mainnet'
NEXT_PUBLIC_DEFAULT_NETWORK=testnet

# Set to true during development to skip real wallet connection
NEXT_PUBLIC_USE_MOCK_WALLET=true

# Your deployed nano contract IDs (JSON array)
NEXT_PUBLIC_CONTRACT_IDS_TESTNET=["000001a2b3c4d5e6..."]
NEXT_PUBLIC_CONTRACT_IDS_MAINNET=[]

# App metadata shown in WalletConnect modal
NEXT_PUBLIC_APP_NAME=My dApp Name
NEXT_PUBLIC_APP_DESCRIPTION=Description of my dApp

# Custom node URLs (optional — defaults work for most cases)
# NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.testnet.hathor.network/v1a
# NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
```

**Important**: Mock mode (`NEXT_PUBLIC_USE_MOCK_WALLET=true`) lets you develop and test the UI without a real wallet. It simulates connections, balances, and transactions. Set to `false` when ready for real wallet testing.

## Step 2: Set App Identity

Update these files to brand the dApp:

**`app/layout.tsx`** — Page title and SEO:
```typescript
export const metadata: Metadata = {
  title: 'Your App Name',
  description: 'Your app description',
};
```

**`app/page.tsx`** — Header display name:
```tsx
<Header appName="Your App Name" ... />
```

**`public/images/icon.png`** — Replace with your app icon (used in WalletConnect modal).

**`public/favicon.png`** — Replace with your favicon.

## Step 3: Build Your UI

### Architecture Overview

```
app/layout.tsx          ← Provider tree (do NOT reorder providers)
  └─ ToastProvider
    └─ WalletConnectProvider
      └─ MetaMaskProvider
        └─ UnifiedWalletProvider
          └─ WalletProvider
            └─ HathorProvider
              └─ {children}    ← Your pages render here
```

All pages automatically have access to wallet and contract state through React contexts.

### The Main Page (`app/page.tsx`)

This is the template's example page. **Replace its contents entirely** with your dApp UI. Keep the imports and hooks pattern:

```tsx
'use client';

import { useWallet } from '@/contexts/WalletContext';
import { useHathor } from '@/contexts/HathorContext';
import Header from '@/components/Header';

export default function Home() {
  const { balance, address, refreshBalance, sendNanoContractTx } = useWallet();
  const { network, isConnected, getContractStateForToken, getContractIdForToken } = useHathor();

  return (
    <div className="min-h-screen bg-slate-900">
      <Header appName="Your App" selectedToken="HTR" onTokenChange={() => {}} />
      <main className="container mx-auto px-6 py-8">
        {/* Your UI here */}
      </main>
    </div>
  );
}
```

### Adding New Pages

Create files in `app/` following Next.js App Router conventions:

```
app/
├── page.tsx                    ← / (home)
├── dashboard/page.tsx          ← /dashboard
├── history/page.tsx            ← /history
└── settings/page.tsx           ← /settings
```

Every page must be `'use client'` if it uses wallet hooks. All contexts are available automatically — no extra wrapping needed.

### Creating Components

Place new components in `components/`. Use existing UI primitives from `components/ui/`:

- `Button` — `components/ui/button.tsx`
- `Card` / `CardHeader` / `CardContent` — `components/ui/card.tsx`
- `Dialog` — `components/ui/dialog.tsx`
- `Select` — `components/ui/select.tsx`

### Styling

This project uses **Tailwind CSS**. The color scheme is based on `slate` tones with an orange accent (`rgb(255, 166, 0)` to `rgb(255, 115, 0)` gradient). Global styles are in `app/globals.css`.

## Step 4: Interact with Nano Contracts

### Available Hooks

**`useHathor()`** — Network, connection, and contract state:
```typescript
const {
  isConnected,          // boolean — is a wallet connected?
  address,              // string | null — connected wallet address
  network,              // 'testnet' | 'mainnet'
  contractStates,       // Record<string, ContractState> — keyed by token symbol
  getContractStateForToken, // (token: string) => ContractState | null
  getContractIdForToken,    // (token: string) => string | null
  coreAPI,              // HathorCoreAPI instance for direct node queries
  connectWallet,        // () => Promise<void>
  disconnectWallet,     // () => Promise<void>
  switchNetwork,        // (network: Network) => Promise<void>
  refreshContractStates,// () => Promise<void>
  allTransactions,      // ContractTransaction[] — history from all contracts
  isLoadingHistory,     // boolean
  refreshHistory,       // () => Promise<void>
} = useHathor();
```

**`useWallet()`** — Balance and transactions:
```typescript
const {
  balance,            // bigint — balance in cents (100 = 1.00 token)
  address,            // string | null
  balanceVerified,    // boolean — has balance been fetched?
  isLoadingBalance,   // boolean
  refreshBalance,     // (tokenUid?: string, network?: Network) => Promise<void>
  sendNanoContractTx, // (params) => Promise<any> — send a transaction
  setBalance,         // React.Dispatch — for resetting balance on token switch
} = useWallet();
```

**`useUnifiedWallet()`** — Low-level wallet adapter info:
```typescript
const { walletType, adapter } = useUnifiedWallet();
// walletType: 'walletconnect' | 'metamask' | null
```

### Sending a Transaction

```typescript
const { sendNanoContractTx } = useWallet();
const { network, getContractIdForToken, getContractStateForToken } = useHathor();

const handleAction = async () => {
  const contractId = getContractIdForToken('HTR');
  const contractState = getContractStateForToken('HTR');
  const tokenUid = contractState?.token_uid || '00';

  const result = await sendNanoContractTx({
    network,
    nc_id: contractId,
    method: 'your_method',       // The nano contract method name
    args: [arg1, arg2],          // Method arguments
    actions: [
      {
        type: 'deposit',         // 'deposit' or 'withdrawal'
        amount: '1000',          // Amount in cents (1000 = 10.00 tokens)
        token: tokenUid,         // Token UID ('00' for HTR)
      },
    ],
    push_tx: true,
  });

  console.log('TX Hash:', result.response?.hash);
};
```

### Reading Contract State

Contract state is automatically fetched and cached in `HathorContext`. Access it via hooks:

```typescript
const { getContractStateForToken } = useHathor();
const state = getContractStateForToken('HTR');
// state.token_uid, state.available_tokens (bigint), state.total_liquidity_provided (bigint)
```

For direct API calls (not cached):
```typescript
const { coreAPI } = useHathor();

// Fetch state with specific fields
const state = await coreAPI.getContractState(contractId, ['field1', 'field2']);

// Fetch transaction history
const history = await coreAPI.getContractHistory(contractId, 100);

// Call a view function (read-only, no wallet needed)
const result = await coreAPI.callViewFunction(contractId, 'method_name', [args]);

// Get blueprint info
const blueprint = await coreAPI.getBlueprintInfo(blueprintId);
```

### Adding Custom Contract State Fields

If your nano contract has custom state fields beyond the defaults (`token_uid`, `available_tokens`, `total_liquidity_provided`):

1. **Update the type** in `types/hathor.ts`:
```typescript
export interface ContractState {
  token_uid: string;
  available_tokens: bigint;
  total_liquidity_provided: bigint;
  // Add your fields:
  your_custom_field: number;
  another_field: string;
  [key: string]: any;
}
```

2. **Update the field list** in `lib/hathorCoreAPI.ts` → `getContractState()`:
```typescript
async getContractState(
  contractId: string,
  fields: string[] = ['token_uid', 'available_tokens', 'total_liquidity_provided', 'your_custom_field', 'another_field']
): Promise<ContractState> {
```

3. **Use in components**:
```typescript
const state = getContractStateForToken('HTR');
console.log(state?.your_custom_field);
```

### Toast Notifications

```typescript
import { toast } from '@/lib/toast';

toast.success('Transaction confirmed!');
toast.error('Something went wrong');
toast.info('Please confirm in your wallet...');
```

## Step 5: Adding Env Vars

If you need new environment variables:

1. Add to `.env.local` with `NEXT_PUBLIC_` prefix (for client-side access)
2. Add to `.env.example` with documentation
3. Read in `lib/config.ts`:
```typescript
export const config = {
  // ... existing config
  yourNewVar: process.env.NEXT_PUBLIC_YOUR_VAR || 'default',
};
```

**Important**: Next.js requires `NEXT_PUBLIC_` env vars to be referenced as literal strings (not via dynamic key access) because they are replaced at build time.

## Project Structure

```
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout — provider tree (DO NOT reorder)
│   ├── page.tsx                # Home page — REPLACE WITH YOUR UI
│   └── globals.css             # Global styles (Tailwind)
├── components/                 # React components
│   ├── Header.tsx              # App header with wallet connect button
│   ├── BalanceCard.tsx         # Wallet balance display
│   ├── ContractInfoPanel.tsx   # Contract state display
│   ├── NetworkSelector.tsx     # Testnet/Mainnet dropdown
│   ├── TokenSelector.tsx       # Token picker (when multiple contracts)
│   ├── WalletConnectionModal.tsx # Wallet connection dialog
│   ├── HelpIcon.tsx            # Tooltip help icon
│   └── ui/                     # Base UI primitives (button, card, dialog, select)
├── contexts/                   # React Context providers
│   ├── HathorContext.tsx       # Main context: network, contracts, connection
│   ├── WalletContext.tsx       # Balance management, sendNanoContractTx
│   ├── UnifiedWalletContext.tsx # Unified adapter over MetaMask/WalletConnect
│   ├── MetaMaskContext.tsx     # MetaMask Snaps integration
│   └── WalletConnectContext.tsx # WalletConnect/Reown integration
├── lib/                        # Core utilities
│   ├── config.ts               # Env var parsing — ADD NEW VARS HERE
│   ├── hathorRPC.ts            # RPC service (wallet communication)
│   ├── hathorCoreAPI.ts        # Blockchain node API (read contract state)
│   ├── walletConnectConfig.ts  # WalletConnect metadata
│   ├── walletConnectClient.ts  # WalletConnect client singleton
│   ├── utils.ts                # Formatting helpers
│   ├── toast.tsx               # Toast notification system
│   └── version.ts              # App version constant
├── types/                      # TypeScript definitions
│   ├── hathor.ts               # ContractState, BlueprintInfo, RPC types
│   ├── wallet.ts               # WalletAdapter interface
│   ├── index.ts                # Re-exports
│   └── metamask.d.ts           # MetaMask window types
├── __tests__/                  # Tests
│   ├── unit/                   # Unit tests (vitest)
│   └── integration/            # Integration tests (vitest)
├── __mocks__/                  # Test mocks
├── e2e/                        # E2E tests (Playwright)
├── public/                     # Static assets
│   ├── favicon.png             # Favicon — REPLACE
│   └── images/icon.png         # App icon — REPLACE
├── .env.example                # Full env var documentation
├── .env.local.example          # Quick-start env (mock mode enabled)
├── .env.local                  # Your actual config (gitignored)
└── scripts/deploy.sh           # Deployment script
```

## Development Commands

```bash
npm run dev            # Start dev server at http://localhost:3000
npm run build          # Production build
npm run lint           # ESLint
npm run test           # Unit tests (watch mode)
npm run test:run       # Unit tests (single run)
npm run test:coverage  # Tests with coverage report
npm run test:e2e       # Playwright E2E tests
```

## Testing

- Unit tests: `__tests__/unit/` — test utilities, API clients, RPC service
- Integration tests: `__tests__/integration/` — test context providers with mocked wallets
- E2E tests: `e2e/` — test full page flows with Playwright
- Mocks: `__mocks__/` — mock implementations for wallet APIs
- Coverage thresholds: 80% lines/statements/functions, 70% branches

When adding features, add corresponding tests. Use mocks from `__mocks__/` for wallet interactions.

## Key Concepts

### Wallet Connection Flow

1. User clicks "Connect Wallet" → `WalletConnectionModal` opens
2. User picks MetaMask Snaps or Reown (WalletConnect)
3. Provider's `connect()` is called → `UnifiedWalletContext` wraps it in a unified `WalletAdapter`
4. `HathorContext` detects connection → syncs address and network from wallet
5. `WalletContext` begins balance fetching via `HathorRPCService`

### How Contract IDs Map to Tokens

Each contract ID in `NEXT_PUBLIC_CONTRACT_IDS_TESTNET` is fetched for its state. The `token_uid` field in the state determines which token symbol it maps to (looked up via the node API). This means:
- One contract per token
- Token symbol is resolved automatically
- Access state by token symbol: `getContractStateForToken('HTR')`

### Network Switching

- Stored in localStorage (`hathor_selected_network`)
- Changing network **disconnects** the wallet (Hathor wallets require this)
- Contract states are re-fetched for the new network
- `HathorCoreAPI` automatically uses the correct node URL

### Mock Mode

When `NEXT_PUBLIC_USE_MOCK_WALLET=true`:
- `HathorRPCService` returns simulated responses
- Wallet connects instantly with a fake address
- Balance returns 1250.50 HTR
- Transactions return mock hashes
- Contract states use hardcoded defaults

Use mock mode for UI development, then switch to `false` for real wallet integration testing.

## Files You Should NOT Modify (Unless Necessary)

These files contain core infrastructure. Modifying them incorrectly will break wallet connectivity:

- `contexts/WalletConnectContext.tsx` — WalletConnect session management
- `contexts/MetaMaskContext.tsx` — MetaMask Snaps integration
- `contexts/UnifiedWalletContext.tsx` — Wallet adapter unification
- `lib/hathorRPC.ts` — RPC protocol implementation
- `lib/walletConnectClient.ts` — WalletConnect client singleton
- `app/layout.tsx` — Provider ordering (changing order breaks context dependencies)

## Files You SHOULD Modify

- `app/page.tsx` — **Replace entirely** with your dApp UI
- `app/` — Add new pages
- `components/` — Add new components
- `.env.local` — Configure WalletConnect ID, contract IDs, app name
- `types/hathor.ts` — Add custom contract state fields
- `lib/hathorCoreAPI.ts` — Add custom state fields to `getContractState()` defaults
- `lib/config.ts` — Add new env vars
- `public/` — Replace icon and favicon

## Resources

- [Hathor Documentation](https://docs.hathor.network)
- [Nano Contracts Guide](https://docs.hathor.network/guides/nano-contracts/)
- [Hathor Wallet API](https://docs.hathor.network/guides/headless-wallet/http-api/)
- [WalletConnect Cloud](https://cloud.walletconnect.com/) — Get your Project ID
- [Hathor Discord](https://discord.gg/hathor)
