# MCP Registry CLI

Command-line tool for interacting with the MCP (Model Context Protocol) registry API.

## Installation

```bash
npm install
npm run build
npm link  # Makes 'mcp-registry' command available globally
```

## Usage

### List all MCPs
```bash
mcp-registry list
mcp-registry list --category database
mcp-registry list --featured
mcp-registry list --search postgres
```

### Get MCP details
```bash
mcp-registry get postgres
```

### Search MCPs
```bash
mcp-registry search database
```

### List categories
```bash
mcp-registry categories
```

### Generate import JSON from manifest
```bash
mcp-registry import ./mcp-iop-ticketing-server/manifest.json
# This generates JSON that can be added to the registry via admin API
```

## Environment Variables

- `MCP_REGISTRY_API_URL` - Registry API URL (default: http://localhost:3000)

## Adding MCPs to Registry

The CLI generates JSON from manifest files. To actually add MCPs to the registry:

1. Generate the JSON:
   ```bash
   mcp-registry import ./path/to/manifest.json
   ```

2. Use the generated JSON with the admin API or a database management tool

## Example: Import IOP Ticketing MCP

```bash
cd mcp-registry-cli
npm install
npm run build
npm link

# Generate import JSON
mcp-registry import ../mcp-iop-ticketing-server/manifest.json

# Copy the generated JSON and use it with the admin API
```