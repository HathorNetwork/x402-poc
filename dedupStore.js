// Persistent dedup ledger + blocklist for the verifier. better-sqlite3 gives
// us an atomic `INSERT OR IGNORE` + `SELECT` cycle which is exactly what we
// need to distinguish first-redemption / idempotent retry / replay attempts.
//
// The same DB file is safe to share across the resource-server and the
// (optional) standalone facilitator thanks to WAL mode.

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function openStore(dbPath) {
  // Ensure the parent directory exists for first-run docker mounts.
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      tx_id          TEXT NOT NULL,
      output_index   INTEGER NOT NULL,
      request_id     TEXT NOT NULL,
      payer_address  TEXT NOT NULL,
      amount         INTEGER NOT NULL,
      charged_amount INTEGER,
      refund_tx_id   TEXT,
      asset          TEXT NOT NULL,
      served_at      INTEGER NOT NULL,
      response_hash  TEXT,
      voided         INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tx_id, output_index)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_address);

    CREATE TABLE IF NOT EXISTS blocklist (
      address     TEXT PRIMARY KEY,
      reason      TEXT NOT NULL,
      blocked_at  INTEGER NOT NULL,
      related_tx  TEXT
    );
  `);

  const stmts = {
    insertIgnore: db.prepare(`
      INSERT OR IGNORE INTO payments
        (tx_id, output_index, request_id, payer_address, amount, asset, served_at)
      VALUES (@txId, @outputIndex, @requestId, @payerAddress, @amount, @asset, @servedAt)
    `),
    selectByKey: db.prepare(
      `SELECT * FROM payments WHERE tx_id = ? AND output_index = ?`
    ),
    markVoided: db.prepare(
      `UPDATE payments SET voided = 1 WHERE tx_id = ? AND output_index = ?`
    ),
    setResponseHash: db.prepare(
      `UPDATE payments SET response_hash = ? WHERE tx_id = ? AND output_index = ?`
    ),
    setUptoSettlement: db.prepare(`
      UPDATE payments
         SET charged_amount = ?, refund_tx_id = ?
       WHERE tx_id = ? AND output_index = ?
    `),
    selectBlock: db.prepare(`SELECT 1 FROM blocklist WHERE address = ?`),
    insertBlock: db.prepare(`
      INSERT OR REPLACE INTO blocklist (address, reason, blocked_at, related_tx)
      VALUES (?, ?, ?, ?)
    `),
    countPayments: db.prepare(`SELECT COUNT(*) AS n FROM payments`),
    countBlocks: db.prepare(`SELECT COUNT(*) AS n FROM blocklist`),
  };

  // Atomic redemption. Returns:
  //   'new'        — first time we're seeing this (txId, outputIndex)
  //   'idempotent' — already redeemed against the same requestId; safe replay
  //   'conflict'   — already redeemed against a DIFFERENT requestId; replay attempt
  const markRedeemedIfFreeTx = db.transaction(
    ({ txId, outputIndex, requestId, payerAddress, amount, asset }) => {
      const info = stmts.insertIgnore.run({
        txId,
        outputIndex,
        requestId,
        payerAddress,
        amount: Number(amount),
        asset,
        servedAt: Math.floor(Date.now() / 1000),
      });
      if (info.changes === 1) return { result: 'new' };

      const existing = stmts.selectByKey.get(txId, outputIndex);
      if (!existing) return { result: 'new' }; // shouldn't happen but be safe
      if (existing.request_id === requestId) return { result: 'idempotent', existing };
      return { result: 'conflict', existing };
    }
  );

  return {
    markRedeemedIfFree(key, fields) {
      return markRedeemedIfFreeTx({ ...key, ...fields });
    },
    getRecord(txId, outputIndex) {
      return stmts.selectByKey.get(txId, outputIndex) || null;
    },
    markVoided(txId, outputIndex) {
      stmts.markVoided.run(txId, outputIndex);
    },
    attachResponseHash(txId, outputIndex, hash) {
      stmts.setResponseHash.run(hash, txId, outputIndex);
    },
    attachUptoSettlement(txId, outputIndex, chargedAmount, refundTxId) {
      stmts.setUptoSettlement.run(
        chargedAmount == null ? null : Number(chargedAmount),
        refundTxId || null,
        txId,
        outputIndex
      );
    },
    isBlocked(address) {
      return Boolean(stmts.selectBlock.get(address));
    },
    addBlock(address, reason, relatedTx) {
      stmts.insertBlock.run(address, String(reason || 'manual'), Math.floor(Date.now() / 1000), relatedTx || null);
    },
    stats() {
      return {
        payments: stmts.countPayments.get().n,
        blocked: stmts.countBlocks.get().n,
        path: dbPath,
      };
    },
    close() {
      db.close();
    },
  };
}

module.exports = { openStore };
