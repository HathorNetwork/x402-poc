# Headless wallet-lib WebSocket leak fix

## The bug

`@hathor/wallet-lib`'s `GenericWebSocket.closeWs()` only closes the underlying
socket when `readyState === OPEN`:

```js
if (this.ws.readyState === WebSocket.OPEN) {
  this.ws.close();
}
this.ws = null;
```

A socket killed while still `CONNECTING` — TCP already ESTABLISHED, HTTP 101
upgrade not yet received — is therefore **dereferenced without being closed**. The
OS keeps it ESTABLISHED until keepalive eventually reaps it (can be hours).

Reconnect is a flat `retryConnectionInterval` (1000 ms) with no backoff, and three
paths funnel into it (`onError`, ping-timeout `onConnectionDown`, normal close).
Against a connection-capped fullnode (nginx `limit_conn per_ip__ws`), the upgrade
is rejected *after* the TCP connect — i.e. while still `CONNECTING` — so **every
reconnect leaks one ESTABLISHED socket**. The leaked sockets consume more of the
per-IP cap → more rejected upgrades → more leaks. A single active wallet ratchets
up to the per-IP ceiling and parks there (we observed ~40 on the active container;
an idle wallet that never reconnects stays at 1).

This is the root cause of the testnet fullnode 429/WS-flood COE.

Affects bundled wallet-lib **3.1.1** (headless `:latest`=v0.40.0 and `:master`),
and is still present in wallet-lib `v4.0.0` and `master`. Not fixed upstream.
Tracking: `HathorNetwork/hathor-wallet-lib#112`.

## The fix

Two parts (see `../patches/hathor-wallet-lib-ws-leak.patch`, against wallet-lib
`master`, typechecked + WS unit tests green):

1. **`closeWs()` always tears down the socket** regardless of `readyState`
   (`terminate()` on node's `ws`, which force-destroys CONNECTING/half-open
   sockets; `close()` in browsers, which aborts a CONNECTING handshake). **This is
   the leak fix.**
2. **Reconnect uses capped exponential backoff with jitter** instead of a flat
   1 s retry, reset on a successful open. Stops a down/capped server from being
   hammered and de-synchronises many clients on one egress IP.

## How it ships here

- **Upstream (durable):** open a PR with `../patches/hathor-wallet-lib-ws-leak.patch`.
  Once released, pin the headless image to that version and delete this directory.
- **Interim (this directory):** `Dockerfile` extends the official headless image
  and runs `patch-ws-leak.js`, which rewrites the compiled `closeWs()` of the
  bundled 3.1.1 in place. It applies **only the leak fix** (not the backoff) to
  keep the behavioural change minimal. It is **fail-closed**: if the bundled
  wallet-lib changed, the build fails rather than shipping an unpatched wallet.

### Enable the interim image

In `docker-compose.yml`, on the `payer-wallet-headless` service, comment the
`image:` line and uncomment the `build:` block, then redeploy:

```yaml
    # image: hathornetwork/hathor-wallet-headless:master
    build:
      context: ./headless
      dockerfile: Dockerfile
```

Verify after deploy (on the host): the established connections to the fullnode
stay at ~1 under load instead of climbing.

```bash
docker exec <payer-headless> sh -c "cat /proc/net/tcp /proc/net/tcp6 | awk '\$4==\"01\" && \$3 ~ /:01BB$/' | wc -l"
```

## Recommended rollout (stability-first)

1. Deploy the seller-wallet removal first (drops the leaking container; only one
   wallet left behind the NAT IP, so the cap-exhaustion trigger rarely fires).
2. Confirm the connection count is ~1 and stable.
3. Then enable this interim image (or wait for the upstream release) as durable
   insurance against the leak re-triggering after a fullnode blip.
