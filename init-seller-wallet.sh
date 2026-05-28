#!/bin/sh
# Boot-time helper for the seller's wallet-headless. Waits for the headless
# service to come up, then POST /start with the seed so the rest of the stack
# can hit it. The seller wallet is only used by the upto scheme (to issue
# refund txs); the exact scheme never needs it.

set -e

HEADLESS_URL="${SELLER_WALLET_URL:-http://wallet-headless:8000}"
WALLET_ID="${SELLER_WALLET_ID:-seller}"

if [ -z "${SELLER_SEED:-}" ]; then
  echo "[init-seller-wallet] SELLER_SEED is empty — skipping (upto refunds will fail)"
  exec "$@"
fi

echo "[init-seller-wallet] Waiting for headless at $HEADLESS_URL ..."
until curl -sf "$HEADLESS_URL/wallet/status" > /dev/null 2>&1; do
  sleep 2
done
echo "[init-seller-wallet] headless is up"

echo "[init-seller-wallet] Starting wallet '$WALLET_ID' ..."
curl -s -X POST "$HEADLESS_URL/start" \
  -H "Content-Type: application/json" \
  -d "{\"wallet-id\":\"$WALLET_ID\",\"seed\":\"$SELLER_SEED\"}" \
  || echo "[init-seller-wallet] /start returned non-zero (already started?)"

echo ""
echo "[init-seller-wallet] Waiting a few seconds for sync ..."
sleep 5
echo "[init-seller-wallet] Ready. Handing off."

exec "$@"
