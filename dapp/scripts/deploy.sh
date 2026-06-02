#!/bin/bash

# Deployment script for the x402 Hathor dApp.
# Usage: ./scripts/deploy.sh <site> <command> [aws_profile]
#
# Sites:    staging, production
# Commands: build, sync, clear_cache

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <site> <command> [aws_profile]"
  echo ""
  echo "Sites: staging, production"
  echo "Commands: build, sync, clear_cache"
  echo ""
  echo "Example: $0 staging build"
  echo "Example: $0 production sync my-aws-profile"
  exit 1
fi

site=$1
command=$2
aws_profile=$3

# Per-site env. Update before first deploy.
case $site in
  staging)
    NEXT_PUBLIC_DEFAULT_NETWORK=testnet
    NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.testnet.hathor.network/v1a
    NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
    NEXT_PUBLIC_RESOURCE_SERVER_URL=https://api.x402.hathor.dev
    NEXT_PUBLIC_USE_MOCK_WALLET=false
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
    S3_BUCKET=your-staging-bucket
    CLOUDFRONT_ID=your_staging_cloudfront_id
    ;;
  production)
    NEXT_PUBLIC_DEFAULT_NETWORK=mainnet
    NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.testnet.hathor.network/v1a
    NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
    NEXT_PUBLIC_RESOURCE_SERVER_URL=https://api.x402.hathor.dev
    NEXT_PUBLIC_USE_MOCK_WALLET=false
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
    S3_BUCKET=your-production-bucket
    CLOUDFRONT_ID=your_production_cloudfront_id
    ;;
  *)
    echo "Unknown site: $site"
    echo "Valid sites: staging, production"
    exit 1
    ;;
esac

export NEXT_PUBLIC_DEFAULT_NETWORK
export NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET
export NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET
export NEXT_PUBLIC_RESOURCE_SERVER_URL
export NEXT_PUBLIC_USE_MOCK_WALLET
export NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
export S3_BUCKET
export CLOUDFRONT_ID

case $command in
  build)
    echo "Building for site: $site"
    echo "  NEXT_PUBLIC_DEFAULT_NETWORK: $NEXT_PUBLIC_DEFAULT_NETWORK"
    echo "  NEXT_PUBLIC_USE_MOCK_WALLET: $NEXT_PUBLIC_USE_MOCK_WALLET"
    echo "  NEXT_PUBLIC_RESOURCE_SERVER_URL: $NEXT_PUBLIC_RESOURCE_SERVER_URL"
    cp next.config.js next.config.js.bak
    cp next.config.production.js next.config.js
    npm run build
    mv next.config.js.bak next.config.js
    ;;
  sync)
    echo "Syncing for site: $site"
    if [ -n "$aws_profile" ]; then
      aws s3 sync --delete ./out/ s3://$S3_BUCKET --profile $aws_profile
    else
      aws s3 sync --delete ./out/ s3://$S3_BUCKET
    fi
    ;;
  clear_cache)
    echo "Clearing CloudFront cache for site: $site"
    if [ -z "$CLOUDFRONT_ID" ]; then
      echo "Warning: CLOUDFRONT_ID not set, skipping cache invalidation"
      exit 0
    fi
    if [ -n "$aws_profile" ]; then
      aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*" --profile $aws_profile
    else
      aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
    fi
    ;;
  *)
    echo "Unknown command: $command"
    echo "Valid commands: build, sync, clear_cache"
    exit 1
    ;;
esac
