# AGENTS.md — LLM instructions for the x402 Hathor dApp

Source of truth for AI agents (LLMs/IDEs) extending or fixing this dApp.

## Snapshot

| Concept | Where |
|---|---|
| WalletConnect Project ID | `.env.local` → `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Default network | `.env.local` → `NEXT_PUBLIC_DEFAULT_NETWORK` |
| Mock wallet | `.env.local` → `NEXT_PUBLIC_USE_MOCK_WALLET=true` |
| Resource server URL | `.env.local` → `NEXT_PUBLIC_RESOURCE_SERVER_URL` |
| Main page | `app/page.tsx` |
| Payment detail | `app/payment/[txId]/page.tsx` |
| The whole flow | `components/X402Fetch.tsx` |
| RPC wrappers | `lib/hathorRPC.ts` (`sendTransaction`, `signWithAddress`, `getAddress`, `getBalance`) |
| Wallet ctx | `contexts/WalletContext.tsx` |
| Hathor ctx | `contexts/HathorContext.tsx` |
| Local history | `lib/paymentHistory.ts` |

## Available wallet RPC methods

All implemented today across the wallet stack (desktop / mobile / MetaMask
snap). Use them via the typed wrappers in `lib/hathorRPC.ts` and exposed
through `useWallet()` in `contexts/WalletContext.tsx`.

| RPC | Wrapper | When to call |
|---|---|---|
| `htr_getAddress` | `getAddress({network, type})` | Before sending/signing, to get an empty address + index |
| `htr_sendTransaction` | `sendTransaction({network, outputs, push_tx, changeAddress?})` | Pay the seller for a 402 |
| `htr_signWithAddress` | `signWithAddress({network, message, addressIndex})` | Sign the server's `requestId` |
| `htr_getBalance` | `getBalance({network, tokens})` | Show the balance card |
| `htr_getConnectedNetwork` | `getConnectedNetwork()` | Connection diagnostics |

## The x402 flow (single source of truth)

```ts
// 1. Fetch the URL.
const r = await fetch(url, { mode: 'cors' });
if (r.status !== 402) return r;

// 2. Pick the first accept option.
const accept = (await r.json()).accepts[0];

// 3. Grab an empty address + index. We use it as changeAddress so it appears
//    in the tx (the verifier accepts the signing address in either inputs or
//    outputs), and as addressIndex when signing.
const buyer = await getAddress({ network, type: 'first_empty' });

// 4. Send the payment.
const sendResp = await sendTransaction({
  network,
  outputs: [{ address: accept.payTo, value: parseInt(accept.amount, 10),
              token: accept.asset === '00' ? undefined : accept.asset }],
  changeAddress: buyer.address,
  push_tx: true,
});
const txId = HathorRPCService.extractTxId(sendResp);

// 5. Wait for the fullnode to see the tx (~1–2s, no first_block required).
await pollMempool(nodeUrl, txId);

// 6. Sign the requestId.
const signed = await signWithAddress({
  network, message: accept.extra.requestId, addressIndex: buyer.index,
});

// 7. Retry with the proof.
const headerB64 = btoa(JSON.stringify({
  x402Version: 2, scheme: accept.scheme, network: accept.network,
  payload: {
    txId, payerAddress: signed.address.address,
    signature: signed.signature, requestId: accept.extra.requestId,
  },
}));
const r2 = await fetch(url, { mode: 'cors', headers: { 'PAYMENT-SIGNATURE': headerB64 }});
```

## Mock mode

Set `NEXT_PUBLIC_USE_MOCK_WALLET=true` and `HathorRPCService` will return
deterministic fakes for `htr_getBalance`, `htr_getAddress`,
`htr_sendTransaction`, and `htr_signWithAddress`. Useful for UI work without
a real wallet. The `addressIndex` flows through correctly so the signing /
sending UI states all render.

## Adding new pages

Standard Next.js App Router. Add `app/<route>/page.tsx`. All providers are
already mounted in `app/layout.tsx`:

```
ToastProvider → WalletConnectProvider → MetaMaskProvider →
UnifiedWalletProvider → WalletProvider → HathorProvider
```

Don't reorder; later providers depend on earlier ones.

## What this dApp is NOT

- Not a nano-contract dApp. There is no `htr_sendNanoContractTx`, no contract
  state polling, no blueprints. The old escrow / channel / contract UI was
  removed when the project switched to `hathor-direct`.
- Not a wallet-management dApp. There is no key custody, no on-chain
  history beyond a localStorage list of payments this browser has made.

## Tests

- `__tests__/unit/` — vitest unit tests
- `__tests__/integration/` — vitest integration (mocked wallets)
- `e2e/` — Playwright

`npm run lint` · `npm run test:run` · `npm run test:e2e`

## Files you should NOT modify casually

- `contexts/WalletConnectContext.tsx`, `contexts/MetaMaskContext.tsx`,
  `contexts/UnifiedWalletContext.tsx` — adapter unification. Tricky.
- `lib/walletConnectClient.ts` — Reown client singleton.
- `app/layout.tsx` — provider ordering.

## License

MIT
