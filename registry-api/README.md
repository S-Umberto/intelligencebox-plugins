# MCP Registry API

A simple Express API for serving MCP (Model Context Protocol) registry data. Designed to be deployed on Vercel.

## API Endpoints

### Public Endpoints

#### List MCPs
```
GET /api/registry?category=database&featured=true&search=postgres
```

Returns all enabled public MCPs with optional filtering.

#### Get MCP Details
```
GET /api/registry/:id
```

Returns detailed information about a specific MCP.

#### Get MCP Manifest
```
GET /api/registry/:id/manifest
```

Returns the installation manifest for an MCP.

#### Search MCPs
```
GET /api/search?q=database
```

Search MCPs by name, description, tags, or author.

#### List Categories
```
GET /api/categories
```

Returns all available MCP categories.

### Admin Endpoints (Authentication required in production)

#### Create MCP
```
POST /api/admin/registry
Content-Type: application/json

{
  "id": "mcp-id",
  "name": "MCP Name",
  "description": "Description",
  "author": "author",
  "version": "1.0.0",
  "dockerImage": "docker/image",
  "configSchema": {},
  ...
}
```

#### Update MCP
```
PUT /api/admin/registry/:id
Content-Type: application/json

{
  "description": "Updated description",
  "enabled": false,
  ...
}
```

#### Delete MCP
```
DELETE /api/admin/registry/:id
```

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Set environment variables:
```bash
vercel env add MONGODB_URL
vercel env add ADMIN_PASSWORD
```

3. Deploy:
```bash
vercel
```

### Environment Variables

- `MONGODB_URL` - MongoDB connection string (default: uses IntelligenceBox MCP MongoDB cluster)
- `ADMIN_PASSWORD` - Password for admin endpoints (required for production)

## Local Development

```bash
npm install
npm run dev
```

The API will be available at http://localhost:3000