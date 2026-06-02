// Background polling watcher: after we serve a resource on a zero-conf payment,
// we keep an eye on the tx in case the payer double-spends. On a detected void
// we mark the dedup row voided and add the payer to the blocklist.
//
// Best-effort, in-process — lost on restart. POC tradeoff. Real production
// would use the fullnode event WebSocket (VERTEX_METADATA_CHANGED).

'use strict';

const { getTransaction } = require('./helpers');

// Cumulative backoff. ~17 min total then we give up.
const SCHEDULE_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 600_000];

function watchForVoid({ txId, outputIndex, payerAddress, store, log }) {
  let cancelled = false;
  let i = 0;

  const tick = async () => {
    if (cancelled) return;
    try {
      const resp = await getTransaction(txId);
      if (resp && resp.success && resp.meta) {
        const meta = resp.meta;
        const voided = Array.isArray(meta.voided_by) && meta.voided_by.length > 0;
        const conflict = Array.isArray(meta.conflict_with) && meta.conflict_with.length > 0;

        if (voided) {
          store.markVoided(txId, outputIndex);
          if (payerAddress) store.addBlock(payerAddress, 'double_spend', txId);
          if (log) log('VOID-WATCH', `${txId}:${outputIndex} voided; blocked ${payerAddress}`);
          return; // stop
        }

        if (conflict) {
          // Conflict but our tx hasn't been voided yet — keep watching, but
          // log it so we have a breadcrumb.
          if (log) log('VOID-WATCH', `${txId}:${outputIndex} has unresolved conflict, continuing to watch`);
        }

        if (meta.first_block) {
          // Confirmed: the tx is reorg-protected. Stop watching.
          if (log) log('VOID-WATCH', `${txId}:${outputIndex} confirmed by block ${meta.first_block}`);
          return;
        }
      }
    } catch (err) {
      if (log) log('VOID-WATCH', `poll error for ${txId}: ${err.message}`);
    }

    if (++i >= SCHEDULE_MS.length || cancelled) return;
    setTimeout(tick, SCHEDULE_MS[i] - (SCHEDULE_MS[i - 1] || 0));
  };

  setTimeout(tick, SCHEDULE_MS[0]);

  return { cancel: () => { cancelled = true; } };
}

module.exports = { watchForVoid };
