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

# Set environment for building
ENV NEXT_PUBLIC_USE_MOCK_WALLET=false
ENV NEXT_PUBLIC_DEFAULT_NETWORK=testnet
ENV NEXT_PUBLIC_HATHOR_NODE_URL_TESTNET=https://node1.india.testnet.hathor.network/v1a
ENV NEXT_PUBLIC_HATHOR_NODE_URL_MAINNET=https://node1.mainnet.hathor.network/v1a
ENV NEXT_PUBLIC_CONTRACT_IDS='["0000000079862340c1f7822b81f58668e2a62c5f1b69d8d2e3b8fdf1855196c1"]'
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=8264fff563181da658ce64ee80e80458

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
