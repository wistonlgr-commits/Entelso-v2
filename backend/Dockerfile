# Stage 1: Builder — instala dependencias de producción de forma determinista
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# Stage 2: Runner — imagen mínima de producción
FROM node:22-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/src ./src
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD sh -c 'wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3001}/health"' || exit 1
CMD ["node", "src/server.js"]
