#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';
import ToolHelper from './tool-helper.js';

dotenv.config();

const API_BASE_URL = process.env.IOP_API_URL || 'https://ticketing.iopgroup.it/IM.core.api.Radix';
const API_KEY = process.env.IOP_API_KEY;
const SWAGGER_URL = `${API_BASE_URL}/swagger/v1/swagger.json`;

let swaggerSpec = null;
let tools = [];
let clusteredTools = [];
let authToken = null;
const toolHelper = new ToolHelper();

const server = new Server({
  name: 'iop-ticketing-mcp',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to include auth token
httpClient.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle 401 errors
httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && API_KEY) {
      // Try to refresh the token
      await authenticate();
      // Retry the original request
      error.config.headers['Authorization'] = `Bearer ${authToken}`;
      return httpClient.request(error.config);
    }
    return Promise.reject(error);
  }
);

async function authenticate() {
  if (!API_KEY) {
    console.error('Warning: No API key configured. Some endpoints may require authentication.');
    return;
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/api/authenticate/apiKey`, {
      apiKey: API_KEY
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    authToken = response.data.token;
    console.error('Successfully authenticated with API');
  } catch (error) {
    console.error('Failed to authenticate:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

async function loadSwaggerSpec() {
  try {
    const response = await axios.get(SWAGGER_URL);
    swaggerSpec = response.data;
    
    // Extract all GET endpoints
    for (const [path, pathItem] of Object.entries(swaggerSpec.paths)) {
      if (pathItem.get) {
        const operation = pathItem.get;
        const tool = {
          name: operation.operationId || path.replace(/[^a-zA-Z0-9]/g, '_'),
          description: operation.summary || `GET ${path}`,
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        };
        
        // Add parameters to schema
        if (operation.parameters) {
          for (const param of operation.parameters) {
            const paramSchema = param.schema || { type: 'string' };
            
            const propertySchema = {
              type: paramSchema.type || 'string',
              description: param.description || param.name
            };
            
            // Handle array types properly
            if (paramSchema.type === 'array') {
              if (paramSchema.items) {
                propertySchema.items = paramSchema.items;
              } else {
                // Default to string array if items not specified
                propertySchema.items = { type: 'string' };
                console.error(`Warning: Array parameter '${param.name}' missing items schema, defaulting to string array`);
              }
            }
            
            if (paramSchema.format) {
              propertySchema.format = paramSchema.format;
            }
            
            if (paramSchema.enum) {
              propertySchema.enum = paramSchema.enum;
            }
            
            if (paramSchema.minimum !== undefined) {
              propertySchema.minimum = paramSchema.minimum;
            }
            
            if (paramSchema.maximum !== undefined) {
              propertySchema.maximum = paramSchema.maximum;
            }
            
            tool.inputSchema.properties[param.name] = propertySchema;
            
            if (param.required) {
              tool.inputSchema.required.push(param.name);
            }
          }
        }
        
        tools.push({
          ...tool,
          path: path,
          parameters: operation.parameters || []
        });
      }
    }
    
    console.error(`Loaded ${tools.length} GET endpoints from Swagger spec`);
    
    // Create clustered tools
    createClusteredTools();
  } catch (error) {
    console.error('Failed to load Swagger spec:', error.message);
    throw error;
  }
}

function createClusteredTools() {
  const categories = toolHelper.getAllCategories();
  
  for (const category of categories) {
    // Create a clustered tool for each category
    const clusteredTool = {
      name: `${category.id}_cluster`,
      description: `${category.icon} ${category.name}: ${category.description}`,
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'The specific operation to perform',
            enum: category.tools
          },
          parameters: {
            type: 'object',
            description: 'Parameters for the selected operation',
            additionalProperties: true
          }
        },
        required: ['operation']
      },
      categoryTools: category.tools,
      categoryInfo: category
    };
    
    clusteredTools.push(clusteredTool);
  }
  
  console.error(`Created ${clusteredTools.length} clustered tools from ${tools.length} endpoints`);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!swaggerSpec) {
    await loadSwaggerSpec();
  }
  
  // Return clustered tools by default to reduce the number of tools
  // This helps prevent overwhelming the AI model
  const useClusteredTools = process.env.USE_CLUSTERED_TOOLS !== 'false';
  
  if (useClusteredTools) {
    return {
      tools: clusteredTools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema
      }))
    };
  } else {
    // Return all individual tools (original behavior)
    return {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema
      }))
    };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!swaggerSpec) {
    await loadSwaggerSpec();
  }
  
  const { name, arguments: args } = request.params;
  
  // Check if this is a clustered tool
  if (name.endsWith('_cluster')) {
    const clusteredTool = clusteredTools.find(t => t.name === name);
    if (!clusteredTool) {
      throw new Error(`Unknown clustered tool: ${name}`);
    }
    
    // Extract the actual tool name and parameters
    const actualToolName = args.operation;
    const actualParameters = args.parameters || {};
    
    // Find the actual tool
    const tool = tools.find(t => t.name === actualToolName);
    if (!tool) {
      throw new Error(`Unknown operation: ${actualToolName}`);
    }
    
    // Call the actual tool with the parameters
    return callTool(tool, actualParameters);
  }
  
  // Regular tool call
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  
  return callTool(tool, args);
});

async function callTool(tool, args) {
  
  try {
    let url = tool.path;
    const config = {
      params: {}
    };
    
    // Handle path parameters and query parameters
    for (const param of tool.parameters) {
      const value = args[param.name];
      
      if (value !== undefined) {
        if (param.in === 'path') {
          // Replace path parameter in URL
          url = url.replace(`{${param.name}}`, encodeURIComponent(value));
        } else if (param.in === 'query') {
          // Add to query parameters
          config.params[param.name] = value;
        }
      }
    }
    
    const response = await httpClient.get(url, config);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2)
        }
      ]
    };
  } catch (error) {
    let errorMessage = `Error: ${error.message}`;
    
    if (error.response) {
      errorMessage += `\nStatus: ${error.response.status}`;
      if (error.response.data) {
        errorMessage += `\nResponse: ${JSON.stringify(error.response.data, null, 2)}`;
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: errorMessage
        }
      ],
      isError: true
    };
  }
}

async function main() {
  try {
    // Authenticate if API key is provided
    await authenticate();
    
    // Pre-load Swagger spec
    await loadSwaggerSpec();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('IOP Ticketing MCP server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});