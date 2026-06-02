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
//
// Payload shape (multi-signature; no legacy single-sig back-compat):
//   {
//     x402Version: 2, scheme, network,
//     payload: {
//       txId,
//       signatures: [{address, signature}, ...],   // one entry per unique tx input address
//       requestId,
//     }
//   }
//
// The verifier requires every unique input address in the tx to be present in
// `signatures` with a signature that verifies over `requestId`. That proves the
// claimant controls every funding source of the payment. The "canonical payer"
// (for blocklist / dedup record / upto refund target) is the address of the
// FIRST entry in `signatures` — client controls the ordering.
async function verifyDirectPayment({
  payload,
  requirements,
  fullnodeUrl,
  dedupStore,
  serverSecret,
  zeroConfMaxAmount = Number.MAX_SAFE_INTEGER,
}) {
  if (!payload || typeof payload !== 'object') return fail('missing_payload');
  const inner = payload.payload || {};
  const { txId, signatures, requestId } = inner;
  if (!txId || !requestId) return fail('missing_payload_fields');
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return fail('missing_signatures');
  }

  // Canonical payer = first signature's address. Used for blocklist, dedup
  // record and upto refund recipient.
  const firstSig = signatures[0];
  if (!firstSig || typeof firstSig.address !== 'string' || typeof firstSig.signature !== 'string') {
    return fail('malformed_signatures');
  }
  const payerAddress = firstSig.address;

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

  // 4) Build a map of {address → signature} from the payload. Reject
  // duplicate addresses with conflicting signatures (defensive — the wallet
  // shouldn't produce these, but we don't trust the wire).
  const sigByAddr = new Map();
  for (const entry of signatures) {
    if (!entry || typeof entry.address !== 'string' || typeof entry.signature !== 'string') {
      return fail('malformed_signatures');
    }
    const prev = sigByAddr.get(entry.address);
    if (prev && prev !== entry.signature) return fail('duplicate_signatures');
    sigByAddr.set(entry.address, entry.signature);
  }

  // 5) Every unique input address must be present in the signatures map
  // AND its signature must verify. That's what "the claimant controls
  // every funding source" cryptographically reduces to.
  const inAddrs = getInputAddresses(tx);
  if (inAddrs.size === 0) return fail('no_input_addresses');

  for (const inAddr of inAddrs) {
    const sig = sigByAddr.get(inAddr);
    if (!sig) return fail(`missing_signature_for_input:${inAddr}`);
    if (!verifyMessageSignature(requestId, sig, inAddr)) {
      return fail(`bad_signature:${inAddr}`);
    }
  }

  // 6) Blocklist: payers caught double-spending earlier are refused. The
  // canonical payer (first signature) is the one we blocklist on void, so we
  // check that address here.
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
  // the redemption. We key dedup on (txId, outputIndex) and record the
  // canonical payer (first signature address).
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
    payerAddress, // first signature's address — used for refund target etc.
    amount: String(paying.value),
    paidAmount: String(paying.value),
    asset: paying.token,
    requestId,
    idempotent,
    existingRecord: idempotent ? dedup.existing : null,
  };
}

module.exports = { verifyDirectPayment };
