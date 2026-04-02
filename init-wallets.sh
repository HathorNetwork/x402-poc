#!/bin/sh
# Wait for wallet-headless to be ready
echo "Waiting for wallet-headless..."
until curl -sf http://wallet-headless:8000/wallet/status > /dev/null 2>&1; do
  sleep 2
done
echo "Wallet-headless is ready"

# Start facilitator wallet
echo "Starting facilitator wallet..."
curl -s -X POST http://wallet-headless:8000/start \
  -H "Content-Type: application/json" \
  -d "{\"wallet-id\":\"facilitator\",\"seed\":\"$FACILITATOR_SEED\"}"
echo ""

# Start seller wallet
echo "Starting seller wallet..."
curl -s -X POST http://wallet-headless:8000/start \
  -H "Content-Type: application/json" \
  -d "{\"wallet-id\":\"seller\",\"seed\":\"$SELLER_SEED\"}"
echo ""

# Wait for wallets to sync
echo "Waiting for wallets to sync..."
sleep 10
echo "Wallets initialized"

# Start the actual service (passed as arguments)
exec "$@"
