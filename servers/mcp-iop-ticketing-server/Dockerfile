FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Make scripts executable
RUN chmod +x index.js list-endpoints.js

# The MCP server uses stdio, so we use the index.js as entrypoint
ENTRYPOINT ["node", "index.js"]