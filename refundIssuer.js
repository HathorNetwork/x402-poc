// hathor-direct-upto refund: after the resource server determines the actual
// usage, it asks the seller's wallet-headless to send `paid - charged` back to
// the payer. Fire-and-forget; if it fails we surface refundError to the caller.
//
// We talk to the same POST /wallet/send-tx endpoint the dApp would have used.
// The seller wallet must be loaded and funded with HTR (or the relevant token)
// ahead of time — see init-seller-wallet.sh + docker-compose.yml.

'use strict';

async function issueRefund({
  sellerWalletUrl,
  sellerWalletId,
  refundAddress,
  amount,
  asset,
  log,
}) {
  if (!sellerWalletUrl) throw new Error('refundIssuer: sellerWalletUrl not configured');
  if (!sellerWalletId) throw new Error('refundIssuer: sellerWalletId not configured');
  if (!refundAddress) throw new Error('refundIssuer: refundAddress missing');
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`refundIssuer: invalid amount ${amount}`);
  }

  const output = { address: refundAddress, value };
  // HTR is '00' implicitly; for custom tokens we must set token.
  if (asset && asset !== '00') output.token = asset;

  const body = { outputs: [output] };

  if (log) log('REFUND', `POST ${sellerWalletUrl}/wallet/send-tx — ${value} ${asset || '00'} → ${refundAddress}`);

  const resp = await fetch(`${sellerWalletUrl}/wallet/send-tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Wallet-Id': sellerWalletId,
    },
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await resp.json();
  } catch (_) {
    throw new Error(`refund tx call returned non-JSON (status ${resp.status})`);
  }

  if (!resp.ok || payload.success === false) {
    const msg = payload && (payload.error || payload.message)
      || `HTTP ${resp.status}`;
    throw new Error(`refund tx failed: ${msg}`);
  }

  const txId = payload.hash || payload.tx_id || (payload.tx && payload.tx.hash) || null;
  if (!txId) throw new Error('refund tx accepted but no txId in response');

  if (log) log('REFUND', `refund tx broadcast — ${txId}`);
  return { txId };
}

module.exports = { issueRefund };
