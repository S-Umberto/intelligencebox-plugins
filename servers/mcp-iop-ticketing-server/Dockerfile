FROM node:20-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY index.ts ./
COPY tool-helper.ts ./
COPY tool-categories.json ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy other necessary files
COPY list-endpoints.js ./

# The MCP server uses stdio, so we use the dist/index.js as entrypoint
ENTRYPOINT ["node", "dist/index.js"]