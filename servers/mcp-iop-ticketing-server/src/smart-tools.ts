import { z } from 'zod';

// Smart defaults and pagination limits
export const DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_SKIP: 0,
};

// Enhanced tool definitions with smart parameter handling
export const SMART_TOOLS = {
  // Articles tools
  searchArticles: {
    name: 'search_articles',
    description: 'Search for articles/products with automatic pagination',
    parameters: z.object({
      searchText: z.string().optional().describe('Search text for articles'),
      active: z.boolean().optional().default(true).describe('Filter by active status'),
      page: z.number().optional().default(1).describe('Page number (starts at 1)'),
      pageSize: z.number().optional().default(DEFAULTS.PAGE_SIZE).describe('Items per page'),
    }),
    handler: async (params: any) => {
      const skip = (params.page - 1) * params.pageSize;
      return {
        operation: '_api_v1_articles',
        parameters: {
          SearchText: params.searchText,
          Active: params.active,
          Skip: skip,
          Take: Math.min(params.pageSize, DEFAULTS.MAX_PAGE_SIZE),
        }
      };
    }
  },

  getArticleById: {
    name: 'get_article_by_id',
    description: 'Get a specific article by ID',
    parameters: z.object({
      id: z.string().describe('Article ID'),
    }),
    handler: async (params: any) => ({
      operation: '_api_v1_articles_id__id_',
      parameters: { id: params.id }
    })
  },

  // Customer tools
  searchCustomers: {
    name: 'search_customers',
    description: 'Search for customers with automatic pagination',
    parameters: z.object({
      searchText: z.string().optional().describe('Search text for customers'),
      page: z.number().optional().default(1).describe('Page number'),
      pageSize: z.number().optional().default(DEFAULTS.PAGE_SIZE).describe('Items per page'),
    }),
    handler: async (params: any) => ({
      operation: '_api_v1_customers',
      parameters: {
        SearchText: params.searchText,
        Skip: (params.page - 1) * params.pageSize,
        Take: Math.min(params.pageSize, DEFAULTS.MAX_PAGE_SIZE),
      }
    })
  },

  // Order tools
  getRecentOrders: {
    name: 'get_recent_orders',
    description: 'Get recent orders with smart date filtering',
    parameters: z.object({
      days: z.number().optional().default(30).describe('Number of days to look back'),
      state: z.string().optional().describe('Order state filter'),
      page: z.number().optional().default(1).describe('Page number'),
      pageSize: z.number().optional().default(DEFAULTS.PAGE_SIZE).describe('Items per page'),
    }),
    handler: async (params: any) => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - params.days);
      
      return {
        operation: '_api_v1_orders',
        parameters: {
          From: fromDate.toISOString().split('T')[0],
          State: params.state,
          Skip: (params.page - 1) * params.pageSize,
          Take: Math.min(params.pageSize, DEFAULTS.MAX_PAGE_SIZE),
        }
      };
    }
  },

  // Document/InfoBox tools
  listDocumentFolders: {
    name: 'list_document_folders',
    description: 'List document folders without requiring specific IDs',
    parameters: z.object({
      infoboxType: z.string().optional().describe('Type of infobox'),
    }),
    handler: async (params: any) => ({
      operation: '_api_v1_infobox_infoboxFolders',
      parameters: {
        InfoboxTyp: params.infoboxType,
      }
    })
  },

  getDocumentsInFolder: {
    name: 'get_documents_in_folder',
    description: 'Get documents in a specific folder',
    parameters: z.object({
      folderId: z.string().describe('Folder ID'),
      folderNumber: z.number().optional().describe('Folder number'),
      infoboxType: z.string().optional().describe('Type of infobox'),
    }),
    handler: async (params: any) => ({
      operation: '_api_v1_infobox_infoboxFiles',
      parameters: {
        Id: params.folderId,
        FolderNumber: params.folderNumber,
        InfoboxTyp: params.infoboxType,
      }
    })
  },

  // Common tools
  getMessages: {
    name: 'get_messages',
    description: 'Get messages without requiring IDs',
    parameters: z.object({
      unreadOnly: z.boolean().optional().default(false).describe('Show only unread messages'),
    }),
    handler: async (params: any) => ({
      operation: '_api_v1_common_messages',
      parameters: {
        Read: params.unreadOnly ? false : undefined,
      }
    })
  },

  getCompanyInfo: {
    name: 'get_company_info',
    description: 'Get current company information',
    parameters: z.object({}),
    handler: async () => ({
      operation: '_api_v1_common_company',
      parameters: {}
    })
  },

  // Smart search across multiple entities
  universalSearch: {
    name: 'universal_search',
    description: 'Search across articles, customers, and suppliers',
    parameters: z.object({
      searchText: z.string().describe('Text to search for'),
      types: z.array(z.enum(['articles', 'customers', 'suppliers'])).optional()
        .default(['articles', 'customers', 'suppliers']).describe('Entity types to search'),
      pageSize: z.number().optional().default(10).describe('Results per type'),
    }),
    handler: async (params: any) => {
      // This would return multiple operations
      const operations = [];
      
      if (params.types.includes('articles')) {
        operations.push({
          type: 'articles',
          operation: '_api_v1_articles',
          parameters: {
            SearchText: params.searchText,
            Skip: 0,
            Take: params.pageSize,
            Active: true,
          }
        });
      }
      
      if (params.types.includes('customers')) {
        operations.push({
          type: 'customers',
          operation: '_api_v1_customers',
          parameters: {
            SearchText: params.searchText,
            Skip: 0,
            Take: params.pageSize,
          }
        });
      }
      
      if (params.types.includes('suppliers')) {
        operations.push({
          type: 'suppliers',
          operation: '_api_v1_suppliers',
          parameters: {
            SearchText: params.searchText,
            Skip: 0,
            Take: params.pageSize,
          }
        });
      }
      
      return operations;
    }
  },
};

// Helper function to clean undefined parameters
export function cleanParameters(params: any): any {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Export categories with smart tools
export const SMART_CATEGORIES = {
  search: {
    name: 'Smart Search',
    description: 'Intelligent search tools with pagination',
    tools: ['universal_search', 'search_articles', 'search_customers'],
  },
  articles: {
    name: 'Articles & Products',
    description: 'Smart article management',
    tools: ['search_articles', 'get_article_by_id'],
  },
  customers: {
    name: 'Customers',
    description: 'Customer management with smart defaults',
    tools: ['search_customers'],
  },
  orders: {
    name: 'Orders',
    description: 'Order management with date filtering',
    tools: ['get_recent_orders'],
  },
  documents: {
    name: 'Documents',
    description: 'Document and folder management',
    tools: ['list_document_folders', 'get_documents_in_folder'],
  },
  common: {
    name: 'Common',
    description: 'General information and utilities',
    tools: ['get_messages', 'get_company_info'],
  },
};