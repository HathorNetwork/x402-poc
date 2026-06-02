# dApp Dockerfile — multi-stage Next.js standalone build.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# x402 build-time env vars. NEXT_PUBLIC_* are baked into the bundle.
ARG NEXT_PUBLIC_USE_MOCK_WALLET=false
ARG NEXT_PUBLIC_DEFAULT_NETWORK=testnet
ARG NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.testnet.hathor.network/v1a
ARG NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=8264fff563181da658ce64ee80e80458
ARG NEXT_PUBLIC_RESOURCE_SERVER_URL=http://localhost:3000

ENV NEXT_PUBLIC_USE_MOCK_WALLET=${NEXT_PUBLIC_USE_MOCK_WALLET}
ENV NEXT_PUBLIC_DEFAULT_NETWORK=${NEXT_PUBLIC_DEFAULT_NETWORK}
ENV NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=${NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET}
ENV NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=${NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET}
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
ENV NEXT_PUBLIC_RESOURCE_SERVER_URL=${NEXT_PUBLIC_RESOURCE_SERVER_URL}

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -G nodejs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
