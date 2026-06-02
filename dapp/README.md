# x402 Hathor dApp

A browser-based x402 payment client for Hathor Network's **`hathor-direct`**
scheme — regular UTXO payments, no nano contracts.

Built on Next.js 14 + React 18 + Tailwind. Wallet integration is
WalletConnect/Reown (desktop wallet, mobile wallet) and MetaMask Snaps via a
unified adapter.

## What it does

1. Connect a Hathor wallet (WalletConnect / Reown / MetaMask Snap).
2. Enter an x402-enabled URL.
3. On 402, the dApp shows the payment requirement.
4. Click **Pay & Access** — the wallet signs a regular send-tx + a message
   signature over the server's `requestId`.
5. The dApp retries the request with the proof header; the resource appears
   and a row is recorded in the local payment history.
6. Click any row to open `/payment/[txId]` for an on-chain detail view.

## Setup

```bash
npm install
cp .env.example .env.local
$EDITOR .env.local          # set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
npm run dev
```

Then open <http://localhost:3000> and connect a wallet that supports
`htr_sendTransaction` and `htr_signWithAddress` (desktop, mobile, MetaMask snap
— all of these do as of the rpc-handler version pinned in this repo).

## Environment

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...        # https://cloud.walletconnect.com/
NEXT_PUBLIC_DEFAULT_NETWORK=testnet
NEXT_PUBLIC_USE_MOCK_WALLET=false               # true = simulate the wallet (no real RPC)
NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.testnet.hathor.network/v1a
NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
NEXT_PUBLIC_RESOURCE_SERVER_URL=http://localhost:3000   # where /weather, /generate live
```

## Architecture (short)

- `lib/hathorRPC.ts` — typed wrappers around `htr_sendTransaction` and
  `htr_signWithAddress` (plus `htr_getAddress`, `htr_getBalance`,
  `htr_getConnectedNetwork`). The mock branch lets you exercise the UI without
  a real wallet.
- `contexts/WalletContext.tsx` — exposes `sendTransaction`, `signWithAddress`,
  `getAddress`, plus balance helpers.
- `contexts/HathorContext.tsx` — connection state, network, fullnode read API.
- `components/X402Fetch.tsx` — the entire user flow (fetch → 402 → pay → sign
  → retry → show data). One state machine.
- `lib/paymentHistory.ts` — localStorage-backed list of past payments.
- `app/payment/[txId]/page.tsx` — fetches the tx from the fullnode and
  highlights the paying output / shows void/confirm status.

## Testing

```bash
npm run lint
npm run test:run         # vitest unit + integration
npm run test:e2e         # Playwright (mock-wallet mode)
```

## Production build

```bash
npm run build
npm start
```

For the static-export S3+CloudFront deploy used by `https://x402.hathor.dev`,
see `scripts/deploy.sh` and `.github/workflows/deploy.yml`.

## License

MIT
