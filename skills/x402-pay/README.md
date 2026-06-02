# x402-pay — Claude Code skill

A Claude Code skill that handles HTTP 402 payments on Hathor Network. When a
Claude session makes a request that returns `402 Payment Required` from an
x402-enabled API (or the user explicitly asks to fetch a paid URL), this skill
takes over: it sets up a wallet-headless instance (starting one in Docker if
needed), pays the on-chain HTR, signs the server's `requestId` proof, retries
the request, and surfaces the resource. No browser, no popups, no human
clicking anything beyond yes/no setup prompts.

## What it solves

x402 (Coinbase/Cloudflare's HTTP 402 payment protocol) is built for machines
paying machines. The browser dApp at `https://x402.hathor.dev/` works for human
demos, but the real use case is agents making programmatic paid calls. This
skill is the agent-side companion of the resource server at
`https://api.x402.hathor.dev/`.

## Requirements

- **Claude Code** with skills support.
- **Docker** installed on the machine (only if you don't already run a
  `hathor-wallet-headless` instance).
- **`hathor-wallet-headless`** ≥ the version that ships `POST /wallet/sign-message`
  (see "Endpoint dependency" below).
- A **Hathor wallet seed** funded with HTR on the right network. Testnet
  funds come from <https://faucet.testnet.hathor.network/>.

## Endpoint dependency

This skill uses `POST /wallet/sign-message` on the headless to sign the
`requestId` per input address of the broadcast payment tx. That endpoint was
added to `hathor-wallet-headless` for x402 specifically — PR `#TBD` upstream.
If your headless is older than the release that includes it, the skill aborts
at the signing step with a clear message pointing at the version requirement.

## Install

Copy or symlink this directory under `~/.claude/skills/`:

```bash
# from the repo root
ln -s "$PWD/skills/x402-pay" ~/.claude/skills/x402-pay
```

Claude Code picks it up on next session start. To verify:

```
Inside Claude Code: /x402-pay
```

It should respond by initialising the skill (Step 1 — establish wallet
backend).

## Trigger conditions

The skill is invoked two ways:

1. **Auto-trigger.** Claude detects a `402` status with an `accepts[]` body in
   any tool result and considers this skill relevant. It asks the user
   whether to proceed before doing anything on-chain.
2. **Explicit slash command.** The user types `/x402-pay` to force the skill
   to load right now. Useful if you want to pre-warm the wallet setup before
   any 402 hits.

## Quick start (recommended demo)

1. Get testnet HTR for your wallet: send `>= 5 HTR` to address-0 of your
   wallet's seed.
2. In a Claude Code session, type:

   > "Fetch `https://api.x402.hathor.dev/weather` and tell me what the
   > weather is in São Paulo."

3. Claude makes the request, sees the 402, asks if you want to use the
   x402-pay skill. Say yes.
4. First time only, Claude asks about your wallet:
   - Is the headless running? (No → spin up via Docker.)
   - What's the seed? (Pasted in chat for the demo, or pointed at a file.)
5. The skill pays, signs, retries, and surfaces the weather JSON. Claude
   summarises.

Subsequent calls in the same session skip Step 4 entirely. After the first
successful run, the skill offers to save the headless URL + wallet-id to
memory so future sessions also skip the setup.

## Try the upto flow

The resource server at `api.x402.hathor.dev` exposes a `/generate` route
configured as `hathor-direct-upto`. Try:

> "Fetch `https://api.x402.hathor.dev/generate` and show me the response."

You'll see:
- The 402's `amount` advertises the MAX (5.00 HTR), not a fixed price.
- The skill pays the full max.
- The response body includes `payment.chargedAmount` (actual usage) and
  `payment.refundAmount` (remainder being refunded), with `payment.refundTxId`
  pointing at the on-chain refund tx the seller broadcast back to you.
- The skill surfaces all of that to you.

## Security notes

- The **seed is never written to memory**. The skill takes it once, uses it
  to start the headless, and forgets it.
- The skill **refuses to run cross-network**. A testnet wallet against a
  mainnet API (or vice versa) aborts before any on-chain action.
- The skill **never auto-confirms mainnet usage**. If you opt into mainnet at
  setup time, the prompt makes the risk explicit.
- The deployment at `headless.x402.hathor.dev` from the live PoC is publicly
  reachable — convenient for ops parity during testnet demos but **not** a
  pattern to copy in production. Real deployments should keep the headless
  loopback-only.

## File layout

```
skills/x402-pay/
├── SKILL.md       — the skill instructions Claude reads
└── README.md      — this file (human-facing install + demo guide)
```

## Related

- Resource server at `https://api.x402.hathor.dev/` —
  source at `../../resource-server.js`.
- Reference dApp at `https://x402.hathor.dev/` —
  source at `../../dapp/`.
- Spec discussion + design proposal at
  `/Users/pedroferreira/Hathor/x402/x402-hathor-no-nc-proposal.md`.
