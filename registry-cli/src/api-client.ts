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

    try {
      const response = await fetch(`${this.apiUrl}/api/registry?${params}`);
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('🔒 Authentication required. The API endpoint is protected.');
        }
        if (response.status === 404) {
          throw new Error('🔍 API endpoint not found. Please check your API URL configuration.');
        }
        if (response.status === 500) {
          throw new Error('🚨 Server error. The API service might be temporarily unavailable.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json() as ListResponse;
      return data.mcps || [];
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        throw new Error('🌐 Cannot reach the API server. Please check your internet connection.');
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('🚫 Connection refused. The API server might be down.');
      }
      throw error;
    }

  }

  async get(id: string): Promise<MCPRegistry | null> {
    try {
      const response = await fetch(`${this.apiUrl}/api/registry/${id}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('🔒 Authentication required to view this MCP.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as GetResponse;
      return data.mcp;
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        throw new Error('🌐 Cannot reach the API server. Please check your internet connection.');
      }
      throw error;
    }
  }

  async search(query: string): Promise<MCPRegistry[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('🔍 Invalid search query. Please check your search terms.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as SearchResponse;
      return data.results || [];
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        throw new Error('🌐 Cannot reach the API server. Please check your internet connection.');
      }
      throw error;
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/categories`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as CategoriesResponse;
      return data.categories || [];
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        throw new Error('🌐 Cannot reach the API server. Please check your internet connection.');
      }
      throw error;
    }
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