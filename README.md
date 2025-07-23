# IntelligenceBox Plugins

This repository contains open-source Model Context Protocol (MCP) servers and tools for the IntelligenceBox ecosystem.

## Repository Structure

```
intelligencebox-plugins/
├── servers/                    # MCP server implementations
│   └── mcp-iop-ticketing-server/  # IOP Group ticketing API integration
├── registry-api/              # MCP Registry API (deployed on Vercel)
├── registry-cli/              # CLI tool for managing MCP registry
└── .github/workflows/         # CI/CD workflows
```

## Components

### MCP Servers

#### IOP Ticketing Server
- **Location**: `servers/mcp-iop-ticketing-server`
- **Description**: MCP server for integrating with the IOP Group ticketing API
- **Docker Image**: `ghcr.io/intelligencebox-repo/mcp-iop-ticketing-server:latest`

### Registry API
- **Location**: `registry-api/`
- **Description**: REST API for managing MCP server registry
- **Deployment**: Vercel (https://mcp-registry-api.vercel.app)

### Registry CLI
- **Location**: `registry-cli/`
- **Description**: Command-line tool for managing MCP registry entries

## Quick Start

### Using the IOP Ticketing Server

```bash
# Pull the Docker image
docker pull ghcr.io/intelligencebox-repo/mcp-iop-ticketing-server:latest

# Run with configuration
docker run -e IOP_API_KEY=your-api-key ghcr.io/intelligencebox-repo/mcp-iop-ticketing-server:latest
```

### Using the Registry CLI

```bash
cd registry-cli
npm install
npm run build
npm link

# List all MCP servers
mcp-registry list

# Add a new server
mcp-registry add --id my-server --name "My Server" --docker-image myimage:latest
```

## Development

### Building Servers Locally

```bash
cd servers/mcp-iop-ticketing-server
docker build -t mcp-iop-ticketing-server .
```

### Running Registry API Locally

```bash
cd registry-api
npm install
npm run dev
```

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [IntelligenceBox](https://github.com/intelligencebox-repo/intelligencebox) - The main IntelligenceBox platform
- [Model Context Protocol](https://modelcontextprotocol.io) - The MCP specification