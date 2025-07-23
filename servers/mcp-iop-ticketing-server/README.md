# IOP Ticketing MCP Server

MCP (Model Context Protocol) server for integrating with the IOP Group ticketing API. This server dynamically loads all GET endpoints from the Swagger/OpenAPI specification.

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure if needed:
   ```bash
   cp .env.example .env
   ```

## Features

- **Dynamic endpoint loading**: Automatically discovers and exposes all GET endpoints from the Swagger specification
- **Full parameter support**: Handles both path and query parameters
- **Error handling**: Provides detailed error messages for debugging
- **Type-safe parameters**: Automatically generates parameter schemas from Swagger
- **Authentication support**: Handles API key authentication with automatic token refresh

## Available Tools

The server dynamically loads all GET endpoints from the API's Swagger specification at:
https://ticketing.iopgroup.it/IM.core.api.Radix/swagger/v1/swagger.json

This includes endpoints for:
- Articles and inventory management
- Contacts and correspondence addresses
- Customers and suppliers
- Orders, offers, and delivery notes
- Prices and promotions
- Warehouse and deposits
- Configuration and system information
- And many more...

Each endpoint is exposed as a tool with its operationId as the tool name, or a sanitized version of the path if no operationId is provided.

## Docker Build & Run

Build the Docker image:

```bash
docker build -t iop-ticketing-mcp .
```

## Usage with Claude Desktop

### Option 1: Using Node.js directly

Add this configuration to your Claude Desktop config:

```json
{
  "mcpServers": {
    "iop-ticketing": {
      "command": "node",
      "args": ["/path/to/mcp-iop-ticketing-server/index.js"],
      "env": {
        "IOP_API_URL": "https://ticketing.iopgroup.it/IM.core.api.Radix",
        "IOP_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Option 2: Using Docker

Add this configuration to your Claude Desktop config:

```json
{
  "mcpServers": {
    "iop-ticketing": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "IOP_API_KEY=your_api_key_here", "iop-ticketing-mcp"],
      "env": {
        "IOP_API_URL": "https://ticketing.iopgroup.it/IM.core.api.Radix"
      }
    }
  }
}
```

## Development

To test the server locally:

```bash
npm start
```

The server will automatically fetch and parse the Swagger specification on startup, creating tools for all available GET endpoints.

## Environment Variables

- `IOP_API_URL`: Base URL for the IOP API (default: https://ticketing.iopgroup.it/IM.core.api.Radix)
- `IOP_API_KEY`: Your API key for authentication (required for protected endpoints)

## API Documentation

The full API documentation with all available endpoints is available at:
https://ticketing.iopgroup.it/IM.core.api.Radix/swagger/index.html