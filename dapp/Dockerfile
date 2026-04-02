# Frontend Dockerfile - Multi-stage build for Next.js SSR
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for configurable API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/}

# x402 build-time env vars (can be overridden at build time via --build-arg)
ARG NEXT_PUBLIC_USE_MOCK_WALLET=false
ARG NEXT_PUBLIC_DEFAULT_NETWORK=testnet
ARG NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=http://node1.playground.testnet.hathor.network/v1a
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=8264fff563181da658ce64ee80e80458
ARG NEXT_PUBLIC_BLUEPRINT_ID
ARG NEXT_PUBLIC_CHANNEL_BLUEPRINT_ID
ARG NEXT_PUBLIC_FACILITATOR_ADDRESS
ARG NEXT_PUBLIC_SELLER_ADDRESS
ENV NEXT_PUBLIC_USE_MOCK_WALLET=${NEXT_PUBLIC_USE_MOCK_WALLET}
ENV NEXT_PUBLIC_DEFAULT_NETWORK=${NEXT_PUBLIC_DEFAULT_NETWORK}
ENV NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=${NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET}
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
ENV NEXT_PUBLIC_BLUEPRINT_ID=${NEXT_PUBLIC_BLUEPRINT_ID}
ENV NEXT_PUBLIC_CHANNEL_BLUEPRINT_ID=${NEXT_PUBLIC_CHANNEL_BLUEPRINT_ID}
ENV NEXT_PUBLIC_FACILITATOR_ADDRESS=${NEXT_PUBLIC_FACILITATOR_ADDRESS}
ENV NEXT_PUBLIC_SELLER_ADDRESS=${NEXT_PUBLIC_SELLER_ADDRESS}

# Set environment for production build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS runner

# Install curl for health checks and other utilities
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Build arguments for runtime configuration
ARG NEXT_PUBLIC_API_URL

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/}

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy public directory (includes hathor-modules.json.gz)
COPY --from=builder /app/public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -G nodejs && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Set hostname to 0.0.0.0 to accept connections from outside the container
ENV HOSTNAME=0.0.0.0

# Start Next.js
CMD ["node", "server.js"]
