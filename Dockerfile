# ════════════════════════════════════════
# NICHEAI AUTONOMOUS ENGINE — DOCKERFILE
# Run: docker-compose up -d
# ════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nicheai && adduser -S nicheai -u 1001
USER nicheai

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "server.js"]
