FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY *.js ./
COPY blueprint/ ./blueprint/

EXPOSE 8402 3000

# Default: run the facilitator. Override CMD for other components.
CMD ["node", "facilitator.js"]
