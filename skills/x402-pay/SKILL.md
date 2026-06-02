---
name: x402-pay
description: Pay for HTTP 402 responses on Hathor Network. Use when a fetch/curl/HTTP request returns 402 Payment Required from an x402-enabled API (e.g., api.x402.hathor.dev), or when the user asks you to fetch a paid URL on Hathor. Orchestrates payment via a `hathor-wallet-headless` instance (starts one in Docker if not running).
metadata:
  author: hathor-network
  version: "0.1.0"
---

# x402-pay — pay HTTP 402 responses on Hathor

You're driving an x402 payment for the user. The protocol is:
**fetch → 402 + payment requirements → pay on-chain → sign requestId → retry with proof → resource**.

The wallet backend is `hathor-wallet-headless` running locally (Docker). The user **never sees a popup** — you handle the whole flow conversationally. Confirm intent once; ask for setup info only on the first call of the session; remember answers via `Memory` so subsequent calls skip prompts.

## Inputs you need by the time you're done with Step 1

- `HEADLESS_URL` — **always ask the user; never default silently** (port 8000 is commonly taken on dev machines)
- `WALLET_ID` — **ask the user**; suggested defaults are `agent` or `default`
- `HEADLESS_NETWORK` — must match the 402's `network` field
- a wallet seed — only on cold start

Save these to memory (`Memory` tool) at the end of a successful run so the next session skips Step 1.

---

## Step 0 — Confirm intent (only on auto-trigger)

If the user explicitly invoked you (e.g., `/x402-pay`), skip this step.

Otherwise, when you see a 402 from a tool result, announce:

> "I see this returned 402 Payment Required (`X.XX HTR` to `Wxxx…`). Want me to pay it with the x402-pay skill?"

Only proceed on an explicit yes.

---

## Step 1 — Establish the wallet backend

**Ask first; do not probe-and-guess.** The skill MUST NOT:
- Assume `localhost:8000` silently (the port may be in use by another app).
- Run `docker ps`, read project compose files, or otherwise sniff the local environment to find a headless.
- Inspect the current working directory's repo to infer which wallet the user wants.

Defaults appear only as suggestions inside `AskUserQuestion` options.

### 1.0 — Check memory first

If a previous session saved an `x402-pay-config` memory (HEADLESS_URL, WALLET_ID, HEADLESS_NETWORK), reuse those values and skip ahead to **Step 1.2** to confirm they're still reachable.

### 1.1 — Ask the user where the headless is

Use `AskUserQuestion` with two questions:

**Question 1** — "Where is your hathor-wallet-headless?"
- "http://localhost:8000"  *(common default; only correct if nothing else is on that port)*
- "I don't have one — start a local container in Docker"

If neither option fits, the user picks "Other" and types a URL (e.g., `http://10.0.0.5:8000`).

**Question 2** — "Wallet ID to use?"
- "agent"
- "default"

If they pick "Other", they type their own wallet-id.

If the user picked "start a local container in Docker" for Question 1, branch to **Step 1.4** instead. Otherwise continue.

### 1.2 — Validate the URL is really a headless

Don't trust `/health`: it's a 200-OK on many web services that aren't a headless (e.g., TmuxDeck on port 8000). Hit a headless-specific route and check the response is JSON:

```bash
curl -fsS -H "Accept: application/json" \
  "${HEADLESS_URL}/wallet/status" \
  -H "X-Wallet-Id: ${WALLET_ID}" \
  -o /tmp/x402-status.txt -w "%{http_code} %{content_type}\n"
head -c 400 /tmp/x402-status.txt
```

Three things can come back:

- **Body starts with `<` or content-type is `text/html`** → the URL isn't a headless. Tell the user clearly:
  > "`<url>` returned HTML, not JSON — it's serving a different app (port 8000 is often used by other tools). What's the right URL of your hathor-wallet-headless?"
  
  Re-ask Question 1 from Step 1.1. Do **not** scan the local environment to find another candidate.

- **JSON with `statusCode: 3`** → wallet is READY. Go to **Step 1.6**.

- **JSON with `error`/`message` saying the wallet isn't started, or HTTP 404** → URL is a headless but this wallet-id isn't loaded yet. Go to **Step 1.3** to start it.

### 1.3 — Start a wallet on the existing headless

Use `AskUserQuestion` for the seed material:
- **Paste seed** (24 words) — for testnet PoC only
- **Path to a seed file** — use `Read` to load it
- **Use a pre-configured `seedKey`** (if their headless has one)

**Use the value the user actually supplied** — do not copy any literal value (`"default"`, `"test"`, etc.) from examples elsewhere in this skill. Match the right branch below:

```bash
# Branch A — user pasted a 24-word seed (or you read it from a file):
curl -fsS -X POST "${HEADLESS_URL}/start" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg wid "${WALLET_ID}" --arg seed "${SEED}" \
          '{"wallet-id":$wid, seed:$seed}')"

# Branch B — user supplied a seedKey configured in their headless:
curl -fsS -X POST "${HEADLESS_URL}/start" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg wid "${WALLET_ID}" --arg sk "${SEED_KEY}" \
          '{"wallet-id":$wid, seedKey:$sk}')"
```

The `SEED_KEY` value is **whatever the user typed** in the `AskUserQuestion` answer. If they said "test", send `"seedKey":"test"`. Never substitute "default" unless the user explicitly chose "default".

If the response is `{success: false, error: "..."}`, surface the error verbatim and stop. Common one: `Invalid wallet seedKey` means the key isn't configured in the headless's settings — re-ask Step 1.1 for the right key or switch to the paste-seed branch.

Then run the polling block from Step 1.7. On READY, go to **Step 1.6**.

### 1.4 — Start a local headless in Docker

Use `AskUserQuestion` for the network:
- **testnet** (default for demos)
- **mainnet** (extra warning: this signs real on-chain payments)
- **abort**

Then ask for the **host port** to bind. Default 8000 is commonly taken on dev machines (TmuxDeck, other dev servers). Suggest:
- **8000** *(only if you know nothing else is on it)*
- **8765** *(safe random high port)*

Bind the chosen port and set `HEADLESS_URL=http://localhost:${HOST_PORT}` accordingly. Then ask for the seed (same options as 1.3) and:

```bash
docker run -d --name x402-headless \
  -p ${HOST_PORT}:8000 \
  -e HEADLESS_NETWORK="${NETWORK}" \
  -e HEADLESS_SERVER="${FULLNODE_URL}" \
  -e HEADLESS_SEED_DEFAULT="${SEED}" \
  hathornetwork/hathor-wallet-headless:latest
```

Where `FULLNODE_URL` is:
- `https://node1.testnet.hathor.network/v1a/` for testnet
- `https://node1.mainnet.hathor.network/v1a/` for mainnet

Poll `${HEADLESS_URL}/wallet/status -H "X-Wallet-Id: ..."` until it returns JSON (max 30s); use the same JSON-vs-HTML check as Step 1.2 to confirm we're talking to a headless we just started, not something else that happened to be on the port. The `HEADLESS_SEED_DEFAULT` env var automatically registers a seed under the key `default`, but the wallet under that key is **not** auto-started — you still need to POST `/start` with `seedKey: "default"` (the literal string `"default"` is correct here because the Docker spin-up registers the seed under exactly that key — *not* a value the user picked):

```bash
curl -fsS -X POST "${HEADLESS_URL}/start" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg wid "${WALLET_ID:-agent}" '{"wallet-id":$wid, seedKey:"default"}')"
```

Then run the polling block from Step 1.7. On READY, go to **Step 1.6**.

### 1.7 — Wait for `statusCode === 3` (READY)

**Run this exactly once as a single Bash call.** Do not fire it as multiple parallel curls — concurrent Bash calls in the same response cancel each other on the first non-zero exit.

```bash
for i in $(seq 1 60); do
  STATUS=$(curl -fsS -H "Accept: application/json" \
    "${HEADLESS_URL}/wallet/status" -H "X-Wallet-Id: ${WALLET_ID}" 2>/dev/null \
    | jq -r .statusCode 2>/dev/null)
  if [ "$STATUS" = "3" ]; then
    echo "READY"
    exit 0          # <-- explicit clean exit; do NOT rely on loop fall-through
  fi
  sleep 1
done
echo "TIMEOUT statusCode=$STATUS"
exit 1
```

If this prints `READY` and exits 0, the wallet is ready — **do not re-poll, do not double-check in parallel**. Go straight to Step 1.6.

If it prints `TIMEOUT`, tell the user and stop. Don't retry; the wallet is in a bad state and needs operator attention.

### 1.6 — Network match check

Get the headless's configured network:

```bash
curl -fsS "${HEADLESS_URL}/wallet/status" -H "X-Wallet-Id: ${WALLET_ID}" | jq -r .network
```

Compare to the 402's `accepts[0].network` (e.g., `hathor:testnet`). The headless reports a bare name (`testnet`, `mainnet`); strip the `hathor:` prefix from the 402's value before comparing.

If they don't match, **abort with a clear error**:

> "Your headless wallet is on `mainnet` but the API at `<url>` advertises `hathor:testnet`. Refusing to pay across networks. Either point the skill at a testnet wallet or refresh the URL."

No transaction is broadcast. Do not proceed.

---

## Step 2 — Pay

Parse the 402's `accepts[0]`. You need:
- `amount` (string, atomic units)
- `asset` (token UID, `"00"` for HTR)
- `payTo` (address string)
- `scheme` (`hathor-direct` or `hathor-direct-upto`)
- `network` (e.g., `hathor:testnet`)
- `extra.requestId` (HMAC-signed challenge token)

### 2.1 — Send the payment tx

```bash
curl -fsS -X POST "${HEADLESS_URL}/wallet/send-tx" \
  -H "Content-Type: application/json" \
  -H "X-Wallet-Id: ${WALLET_ID}" \
  -d "$(jq -nc --arg addr "${PAY_TO}" --argjson val ${AMOUNT_INT} --arg tok "${ASSET}" '{
    outputs: [{ address: $addr, value: $val, token: $tok }]
  }')"
```

The `value` field must be an **integer** (atomic units), not a string. The response has `{ success: true, hash: "<txId>" }`. Capture `hash` as `TX_ID`.

If `success` is false, surface the error and stop. Common cause: insufficient HTR. Tell the user to fund the wallet and retry.

### 2.2 — Fetch the broadcast tx and extract input addresses

```bash
curl -fsS "${HEADLESS_URL}/wallet/transaction?id=${TX_ID}" -H "X-Wallet-Id: ${WALLET_ID}" \
  | jq -r '[.inputs[].decoded.address] | unique | .[]'
```

That gives you the **unique** input addresses, one per line. Save them into a shell array (or process iteratively).

### 2.3 — Sign requestId once per unique input address

For each `addr` in the unique-inputs set:

```bash
curl -fsS -X POST "${HEADLESS_URL}/wallet/sign-message" \
  -H "Content-Type: application/json" \
  -H "X-Wallet-Id: ${WALLET_ID}" \
  -d "$(jq -nc --arg msg "${REQUEST_ID}" --arg addr "${addr}" '{
    message: $msg,
    address: $addr
  }')"
```

The response is `{ success: true, signature: "BASE64…", address: "Wxxx…", index: N }`. Accumulate the `{address, signature}` pairs into a JSON array `SIGNATURES`.

> Endpoint requirement: `POST /wallet/sign-message` was added to `hathor-wallet-headless` in version ≥ X.Y.Z (the upstream PR motivated by this skill). If you get a 404 here, the user's headless is too old — point them at the version requirement in this skill's README.

### 2.4 — Assemble the PAYMENT-SIGNATURE header and retry

Build the payload:

```bash
PAYLOAD=$(jq -nc \
  --arg scheme "${SCHEME}" \
  --arg network "${NETWORK_HEADER}" \
  --arg txId "${TX_ID}" \
  --argjson sigs "${SIGNATURES}" \
  --arg requestId "${REQUEST_ID}" \
  '{
     x402Version: 2,
     scheme: $scheme,
     network: $network,
     payload: { txId: $txId, signatures: $sigs, requestId: $requestId }
   }')

PAYMENT_SIG=$(printf '%s' "${PAYLOAD}" | base64 -w0)

curl -fsS "${URL}" -H "PAYMENT-SIGNATURE: ${PAYMENT_SIG}"
```

`NETWORK_HEADER` is the 402's `network` field verbatim (e.g., `hathor:testnet`).
`SCHEME` is the 402's `scheme` field.

Order matters in the `signatures` array: the **first** entry's address is the canonical payer (used by the server for blocklist and — for upto — refund target). If the user has a preference for which address gets the refund, put it first; otherwise the wallet's natural ordering is fine.

If the response is 200, the body is `{ data: <resource>, payment: <metadata> }`. Return `data` to the user.

If the response is 402 again, surface the error reason from the body (`reason` or `error` field) and stop. Common reasons:
- `request_id_expired` — the 402's `extra.requestId` is past its TTL. Re-fetch the URL to get a fresh 402, then redo Step 2.
- `bad_signature:<addr>` — one of the signatures didn't verify. The headless's sign-message must have a bug, or the wallet's keys changed; retry once.
- `missing_signature_for_input:<addr>` — we missed an input address. Step 2.2 should have caught all; double-check the unique set.
- `replay` — the payment was already redeemed. (Unlikely on first try; means the wallet's send-tx returned a known txId, maybe a no-op tx.)

---

## Step 3 — Surface the result

### For `scheme: hathor-direct`
Print the response's `data` field to the user. Mention the txId briefly:

> "Paid `0.XX HTR` via tx `<txId short>`. Here's the response: ..."

### For `scheme: hathor-direct-upto`
The response body includes `payment.chargedAmount`, `payment.refundAmount`, `payment.refundTxId`. Show the user a summary:

> "Authorized up to **5.00 HTR**, actually charged **1.20 HTR**, refunded **3.80 HTR** (refund tx `<refundTxId short>`). Here's the response: ..."

Then print `data`.

The refund tx is on-chain and may not yet be confirmed by the time you respond. It will land within seconds on testnet; the user's wallet will pick it up automatically.

---

## Step 4 — Remember setup (offer once)

If everything succeeded and the user hasn't already opted in, ask:

> "Want me to remember `HEADLESS_URL=<url>`, `WALLET_ID=<id>`, and `HEADLESS_NETWORK=<network>` so the next x402 payment in a new session skips the setup prompts?"

If yes, save a project memory via the `Memory` tool:

```
---
name: x402-pay-config
description: Saved wallet-headless config for x402-pay skill (auto-detected on first 402)
metadata:
  type: project
---

HEADLESS_URL: <whatever the user actually chose in Step 1.1>
WALLET_ID: <whatever the user actually chose>
HEADLESS_NETWORK: <testnet or mainnet>

(Write the actual values here, not the placeholders.)
```

Do **not** save the seed under any circumstances. The seed should only ever be passed at start-time and the user re-types/re-points-to it on each new headless boot.

---

## Error handling — quick reference

| Where | Symptom | What to do |
|---|---|---|
| Step 1.4 | `docker: command not found` | Tell user to install Docker, or re-run Step 1.1 with the URL of an existing headless |
| Step 1.4 | `port is already allocated` | Re-prompt for a different host port (suggest 8765 or 9000) and adjust `HEADLESS_URL` |
| Step 1.2 | URL returns HTML | The URL isn't a headless. Re-prompt Step 1.1 for the right URL; do **not** scan docker/compose to guess |
| Step 2.1 | `{success: false, error: "Insufficient amount of HTR..."}` | Tell user the wallet is underfunded, print the wallet's address-0 (`curl /wallet/address?index=0`), suggest the testnet faucet |
| Step 2.2 | tx not found at headless | Headless may not have indexed the tx yet — retry once after 2s |
| Step 2.3 | `POST /wallet/sign-message` returns 404 | Headless version is too old; mention the version requirement |
| Step 2.3 | `{success: false, error: "address does not belong to the wallet"}` | A tx input came from outside the wallet — that means we're talking to the wrong wallet. Recheck `WALLET_ID` |
| Step 2.4 | `request_id_expired` | Re-fetch the URL for a fresh requestId, then redo from Step 2 (the on-chain tx can be reused with a new signature over the new requestId) |

---

## Notes on what this skill **does not** do

- It does not run on mainnet without an explicit prompt + warning.
- It does not save the seed to memory.
- It does not try to recover from a hung headless beyond a single retry. If the user's wallet is in a weird state (`statusCode` 1 or 2 for minutes), tell them to restart it.
- It does not retry a failed payment indefinitely. One attempt per 402.
- It does not support payment channels (those don't exist in the current `hathor-direct` scheme).
