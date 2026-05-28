// The single source of truth for "is this hathor-direct payment claim valid?"
// Imported by resource-server.js (self-verify) and wrapped over HTTP by
// facilitator.js. No wallet, no nano contract — just fullnode reads plus a
// SQLite dedup/blocklist file.

'use strict';

const {
  getTransaction,
  findPayingOutput,
  getInputAddresses,
  verifyMessageSignature,
} = require('./helpers');
const { verifyAndDecodeRequestId } = require('./requestId');

function fail(reason) {
  return { valid: false, invalidReason: reason };
}

// `requirements` is one PaymentRequirements (object) describing the route the
// client is trying to satisfy: { scheme, network, amount, asset, payTo, resource }.
// `payload` is the decoded PAYMENT-SIGNATURE payload from the client.
async function verifyDirectPayment({
  payload,
  requirements,
  fullnodeUrl,
  dedupStore,
  serverSecret,
  zeroConfMaxAmount = Number.MAX_SAFE_INTEGER,
}) {
  if (!payload || typeof payload !== 'object') return fail('missing_payload');
  const { txId, payerAddress, signature, requestId } = payload.payload || {};
  if (!txId || !payerAddress || !signature || !requestId) {
    return fail('missing_payload_fields');
  }

  // 1) requestId — HMAC + expiry + commitment match against the route.
  const decoded = verifyAndDecodeRequestId(requestId, serverSecret, {
    route: requirements.resource,
    amount: requirements.amount,
    payTo: requirements.payTo,
    asset: requirements.asset,
    network: requirements.network,
  });
  if (!decoded.ok) return fail(decoded.reason);

  // 2) Fetch the tx from the fullnode. (verifier.js doesn't need a wallet —
  // this is what makes the facilitator stateless and seedless.)
  let resp;
  try {
    resp = await getTransaction(txId);
  } catch (err) {
    return fail(`fullnode_error: ${err.message}`);
  }
  if (!resp || !resp.success || !resp.tx) return fail('tx_not_found');
  const { tx, meta } = resp;

  // 3) An output of the right token must pay `payTo` at least `amount`.
  const paying = findPayingOutput(tx, {
    payTo: requirements.payTo,
    asset: requirements.asset,
    minValue: requirements.amount,
  });
  if (!paying) return fail('no_paying_output');

  // 4) The address that signed `requestId` must appear as a TX INPUT — i.e.,
  // it actually contributed UTXOs to the payment. Accepting output addresses
  // would let any recipient of the tx (or any third-party output owner)
  // claim the resource. Inputs are the only set that proves payment ownership.
  const inAddrs = getInputAddresses(tx);
  if (!inAddrs.has(payerAddress)) {
    return fail('payer_not_in_tx_inputs');
  }

  // 5) The signature must verify against the payer's address.
  if (!verifyMessageSignature(requestId, signature, payerAddress)) {
    return fail('bad_signature');
  }

  // 6) Blocklist: payers caught double-spending earlier are refused.
  if (dedupStore && dedupStore.isBlocked(payerAddress)) {
    return fail('blocklisted');
  }

  // 7) Zero-conf safety: refuse if the tx is currently voided or has a
  // visible conflict. (Withheld double-spends are why we ALSO watch the tx
  // post-serve; see voidWatcher.js.)
  if (meta) {
    if (Array.isArray(meta.voided_by) && meta.voided_by.length > 0) {
      return fail('voided');
    }
    if (Array.isArray(meta.conflict_with) && meta.conflict_with.length > 0) {
      return fail('conflicted');
    }
  }

  // 8) Tiered confirmation: amounts above the threshold must have first_block.
  if (Number(requirements.amount) > zeroConfMaxAmount) {
    if (!meta || !meta.first_block) return fail('awaiting_block');
  }

  // 9) Atomic dedup. This both detects replays and is the on-disk record of
  // the redemption.
  const dedup = dedupStore.markRedeemedIfFree(
    { txId, outputIndex: paying.outputIndex },
    {
      requestId,
      payerAddress,
      amount: requirements.amount,
      asset: requirements.asset,
    }
  );

  if (dedup.result === 'conflict') return fail('replay');
  const idempotent = dedup.result === 'idempotent';

  return {
    valid: true,
    txId,
    outputIndex: paying.outputIndex,
    payerAddress,
    amount: String(paying.value),
    paidAmount: String(paying.value),
    asset: paying.token,
    requestId,
    idempotent,
    existingRecord: idempotent ? dedup.existing : null,
  };
}

module.exports = { verifyDirectPayment };
