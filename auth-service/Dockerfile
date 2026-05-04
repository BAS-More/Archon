FROM node:22-alpine

WORKDIR /app

# Install production dependencies
COPY package.json ./
RUN npm install --omit=dev --no-package-lock

# Copy application
COPY server.js ./

# Run as non-root (node user is built-in in node:* images, UID 1000)
USER node

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9000/health', r => process.exit(r.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
