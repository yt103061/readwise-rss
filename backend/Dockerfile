# Use the official Playwright image with Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Install dev dependencies for building, then remove them
RUN npm install --save-dev typescript ts-node @types/express @types/node @types/node-cron \
  && npx tsc \
  && npm prune --omit=dev

# Expose port (Railway sets PORT env var automatically)
EXPOSE 3001

# Run the compiled server
CMD ["node", "dist/index.js"]
