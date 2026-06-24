#!/usr/bin/env node
/*
 * Interim fix for the @hathor/wallet-lib WebSocket socket leak (deployed 3.1.1).
 *
 * GenericWebSocket.closeWs() only calls ws.close() when readyState === OPEN, so a
 * socket killed while still CONNECTING (TCP established, HTTP 101 upgrade not yet
 * received) is dereferenced (this.ws = null) WITHOUT being closed. The OS keeps it
 * ESTABLISHED until keepalive eventually reaps it. Under reconnect churn against a
 * connection-capped fullnode (nginx `limit_conn per_ip__ws` rejects the upgrade
 * after the TCP connect), every retry leaks one ESTABLISHED socket, which consumes
 * more of the per-IP cap -> more rejected upgrades -> more leaks (the COE).
 *
 * This rewrites closeWs() to always terminate()/close() the socket regardless of
 * readyState. It only changes the close path; reconnect backoff is part of the
 * upstream fix (../patches/hathor-wallet-lib-ws-leak.patch), kept out of the
 * interim to minimise behavioural change.
 *
 * FAIL-CLOSED: if the exact expected source block is not found (e.g. the bundled
 * wallet-lib changed), this exits non-zero so the image build fails loudly rather
 * than shipping an unpatched (or silently mis-patched) wallet.
 */

'use strict';

const fs = require('fs');

const target = require.resolve('@hathor/wallet-lib/lib/websocket/base.js');
const version = require('@hathor/wallet-lib/package.json').version;

const MARKER = 'PATCHED-ws-leak: always tear down socket';

// The full closeWs() guard block. The `this.ws.close();` line makes this unique
// (sendMessage() has the same readyState check but calls this.ws.send(msg)).
const NEEDLE = `    if (this.ws.readyState === _isomorphicWs.default.OPEN) {
      this.ws.close();
    }`;

const REPLACEMENT = `    // ${MARKER}: a CONNECTING/CLOSING socket left only-dereferenced leaks an
    // ESTABLISHED connection; terminate() force-destroys it (close() for browsers).
    try {
      if (typeof this.ws.terminate === 'function') {
        this.ws.terminate();
      } else {
        this.ws.close();
      }
    } catch (_e) { /* already closing/closed */ }`;

const src = fs.readFileSync(target, 'utf8');

if (src.includes(MARKER)) {
  console.log(`[patch-ws-leak] already applied to ${target} (wallet-lib ${version}) — skipping`);
  process.exit(0);
}

const matches = src.split(NEEDLE).length - 1;
if (matches !== 1) {
  console.error(`[patch-ws-leak] FAILED: expected exactly 1 closeWs guard, found ${matches}.`);
  console.error(`[patch-ws-leak] bundled @hathor/wallet-lib is ${version} (this patch targets 3.1.1).`);
  console.error('[patch-ws-leak] The bundled wallet-lib changed — regenerate this patch from the new source.');
  console.error('[patch-ws-leak] Refusing to ship an unpatched wallet.');
  process.exit(1);
}

fs.writeFileSync(target, src.replace(NEEDLE, REPLACEMENT));
console.log(`[patch-ws-leak] applied to ${target} (wallet-lib ${version})`);
