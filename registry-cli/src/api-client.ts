import { MCPRegistry } from './types.js';

// API Response types
interface ListResponse {
  mcps: MCPRegistry[];
}

interface GetResponse {
  mcp: MCPRegistry;
}

interface SearchResponse {
  results: MCPRegistry[];
}

interface CategoriesResponse {
  categories: string[];
}

interface ErrorResponse {
  message?: string;
  error?: string;
}

interface CreateUpdateResponse {
  mcp: MCPRegistry;
}

export class MCPRegistryAPIClient {
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.MCP_REGISTRY_API_URL || 'http://localhost:3000';
  }

  async list(filters?: {
    category?: string;
    featured?: boolean;
    search?: string;
  }): Promise<MCPRegistry[]> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.featured) params.append('featured', 'true');
    if (filters?.search) params.append('search', filters.search);

    const response = await fetch(`${this.apiUrl}/api/registry?${params}`);
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required. The API endpoint is protected. Please check if the API URL is correct and accessible.');
      }
      throw new Error(`Failed to fetch MCPs: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ListResponse;
    return data.mcps || [];
  }

  async get(id: string): Promise<MCPRegistry | null> {
    const response = await fetch(`${this.apiUrl}/api/registry/${id}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch MCP: ${response.statusText}`);
    }

    const data = await response.json() as GetResponse;
    return data.mcp;
  }

  async search(query: string): Promise<MCPRegistry[]> {
    const response = await fetch(`${this.apiUrl}/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json() as SearchResponse;
    return data.results || [];
  }

  async getCategories(): Promise<string[]> {
    const response = await fetch(`${this.apiUrl}/api/categories`);
    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    const data = await response.json() as CategoriesResponse;
    return data.categories || [];
  }

  // Admin endpoints (these would need authentication in production)
  async create(mcp: Omit<MCPRegistry, '_id' | 'createdAt' | 'updatedAt'>): Promise<MCPRegistry> {
    const response = await fetch(`${this.apiUrl}/api/admin/registry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcp)
    });

    if (!response.ok) {
      const error = await response.json() as ErrorResponse;
      throw new Error(error.message || 'Failed to create MCP');
    }

    const data = await response.json() as CreateUpdateResponse;
    return data.mcp;
  }

  async createWithAuth(mcp: Omit<MCPRegistry, '_id' | 'createdAt' | 'updatedAt'>, password: string): Promise<MCPRegistry> {
    const response = await fetch(`${this.apiUrl}/api/admin/registry`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password}`
      },
      body: JSON.stringify(mcp)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid password');
      }
      const error = await response.json() as ErrorResponse;
      throw new Error(error.error || error.message || 'Failed to create MCP');
    }

    const data = await response.json() as CreateUpdateResponse;
    return data.mcp;
  }

  async updateWithAuth(id: string, updates: Partial<MCPRegistry>, password: string): Promise<MCPRegistry> {
    const response = await fetch(`${this.apiUrl}/api/admin/registry/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password}`
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid password');
      }
      const error = await response.json() as ErrorResponse;
      throw new Error(error.error || error.message || 'Failed to update MCP');
    }

    const data = await response.json() as CreateUpdateResponse;
    return data.mcp;
  }

  async upsertWithAuth(mcp: Omit<MCPRegistry, '_id' | 'createdAt' | 'updatedAt'>, password: string): Promise<MCPRegistry> {
    try {
      // Try to create first
      return await this.createWithAuth(mcp, password);
    } catch (error: any) {
      // If it already exists (409 or specific error message), try to update
      if (error.message?.includes('already exists') || error.message?.includes('409') || error.message?.includes('MCP with this ID already exists')) {
        console.log('MCP already exists, updating instead...');
        // Remove fields that shouldn't be updated
        const { id, ...updates } = mcp;
        return await this.updateWithAuth(id, updates, password);
      }
      // If it's a different error, rethrow it
      throw error;
    }
  }

  async update(id: string, updates: Partial<MCPRegistry>): Promise<MCPRegistry> {
    const response = await fetch(`${this.apiUrl}/api/admin/registry/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json() as ErrorResponse;
      throw new Error(error.message || 'Failed to update MCP');
    }

    const data = await response.json() as CreateUpdateResponse;
    return data.mcp;
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(`${this.apiUrl}/api/admin/registry/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json() as ErrorResponse;
      throw new Error(error.message || 'Failed to delete MCP');
    }

    return true;
  }
}