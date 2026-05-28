FROM node:22-alpine

# `curl` for the init script + container healthchecks; build deps installed
# transiently for the `better-sqlite3` native compile.
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./

# Install with build deps, then drop them to keep the image small.
RUN apk add --no-cache --virtual .build python3 make g++ \
 && npm install --omit=dev \
 && apk del .build

COPY *.js ./
COPY *.sh ./

# Persistent dedup + blocklist SQLite file lives here.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8402 3000

# Default: run the resource server. Override CMD for the facilitator service.
CMD ["node", "resource-server.js"]
