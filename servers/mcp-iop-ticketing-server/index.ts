#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  Tool,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { z } from 'zod';
import { SMART_TOOLS, cleanParameters, DEFAULTS } from './src/smart-tools.js';
import { 
  LargeResponseHandler, 
  NavigateResponseSchema, 
  QueryResponseSchema, 
  ExportResponseSchema 
} from './src/large-response-handler.js';

// Suppress dotenv console output
const originalLog = console.log;
console.log = () => {};
dotenv.config();
console.log = originalLog;

const API_BASE_URL = process.env.IOP_API_URL || 'https://ticketing.iopgroup.it/IM.core.api.Radix';
const API_KEY = process.env.IOP_API_KEY;
const SWAGGER_URL = `${API_BASE_URL}/swagger/v1/swagger.json`;

interface ToolDefinition {
  name: string;
  description: string;
  path: string;
  parameters: any[];
}

let swaggerSpec: any = null;
let tools: ToolDefinition[] = [];
let authToken: string | null = null;
const responseHandler = new LargeResponseHandler();

const server = new Server({
  name: 'iop-ticketing-mcp-enhanced',
  version: '2.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

const httpClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Add interceptors (same as before)
httpClient.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && API_KEY) {
      await authenticate();
      error.config.headers['Authorization'] = `Bearer ${authToken}`;
      return httpClient.request(error.config);
    }
    return Promise.reject(error);
  }
);

async function authenticate(): Promise<void> {
  if (!API_KEY) {
    process.stderr.write('Warning: No API key configured. Some endpoints may require authentication.\n');
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
    process.stderr.write('Successfully authenticated with API\n');
  } catch (error: any) {
    process.stderr.write(`Failed to authenticate: ${error.message}\n`);
  }
}

async function loadSwaggerSpec(): Promise<void> {
  try {
    const response = await axios.get(SWAGGER_URL);
    swaggerSpec = response.data;
    
    // Extract all GET endpoints
    for (const [path, pathItem] of Object.entries(swaggerSpec.paths as Record<string, any>)) {
      if (pathItem.get) {
        const operation = pathItem.get;
        const tool: ToolDefinition = {
          name: operation.operationId || path.replace(/[^a-zA-Z0-9]/g, '_'),
          description: operation.summary || `GET ${path}`,
          path: path,
          parameters: operation.parameters || []
        };
        
        tools.push(tool);
      }
    }
    
    process.stderr.write(`Loaded ${tools.length} GET endpoints from Swagger spec\n`);
  } catch (error: any) {
    process.stderr.write(`Failed to load Swagger spec: ${error.message}\n`);
    throw error;
  }
}

// Convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodSchema): any {
  // This is a more complete implementation
  const def = (schema as any)._def;
  
  if (def.typeName === 'ZodString') {
    return { type: 'string', description: def.description };
  } else if (def.typeName === 'ZodNumber') {
    return { type: 'number', description: def.description };
  } else if (def.typeName === 'ZodBoolean') {
    return { type: 'boolean', description: def.description };
  } else if (def.typeName === 'ZodOptional') {
    return { ...zodToJsonSchema(def.innerType), required: false };
  } else if (def.typeName === 'ZodDefault') {
    return { ...zodToJsonSchema(def.innerType), default: def.defaultValue() };
  } else if (def.typeName === 'ZodArray') {
    return { 
      type: 'array',
      items: zodToJsonSchema(def.type),
      description: def.description
    };
  } else if (def.typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: def.values,
      description: def.description
    };
  } else if (def.typeName === 'ZodObject') {
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(def.shape())) {
      const propSchema = zodToJsonSchema(value as z.ZodSchema);
      properties[key] = propSchema;
      if (propSchema.required !== false) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      description: def.description
    };
  }
  
  return { type: 'any' };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!swaggerSpec) {
    await loadSwaggerSpec();
  }
  
  // Return smart tools instead of clustered tools
  const smartTools: Tool[] = [];
  
  for (const [, tool] of Object.entries(SMART_TOOLS)) {
    smartTools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.parameters)
    });
  }
  
  // Add navigation tools for large responses
  smartTools.push({
    name: 'navigate_response',
    description: 'Navigate through a saved large response using dot notation paths',
    inputSchema: zodToJsonSchema(NavigateResponseSchema)
  });
  
  smartTools.push({
    name: 'query_response',
    description: 'Query and filter data from a saved large response',
    inputSchema: zodToJsonSchema(QueryResponseSchema)
  });
  
  smartTools.push({
    name: 'export_response',
    description: 'Export a saved response or part of it to a file',
    inputSchema: zodToJsonSchema(ExportResponseSchema)
  });
  
  process.stderr.write(`Returning ${smartTools.length} smart tools\n`);
  
  return { tools: smartTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!swaggerSpec) {
    await loadSwaggerSpec();
  }
  
  const { name, arguments: args } = request.params;
  
  // Handle navigation tools
  if (name === 'navigate_response') {
    const validated = NavigateResponseSchema.parse(args);
    const result = await responseHandler.navigateResponse(validated.response_id, validated.path);
    const handledResult = await responseHandler.handleResponse(result);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(handledResult, null, 2)
        }
      ]
    };
  }
  
  if (name === 'query_response') {
    const validated = QueryResponseSchema.parse(args);
    const result = await responseHandler.queryResponse(validated.response_id, {
      path: validated.path,
      filter: validated.filter,
      limit: validated.limit,
      offset: validated.offset
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
  
  if (name === 'export_response') {
    const validated = ExportResponseSchema.parse(args);
    const message = await responseHandler.exportResponse(
      validated.response_id,
      validated.output_path,
      {
        path: validated.path,
        format: validated.format
      }
    );
    return {
      content: [
        {
          type: 'text',
          text: message
        }
      ]
    };
  }
  
  // Check if this is a smart tool
  const smartTool = Object.values(SMART_TOOLS).find(t => t.name === name);
  
  if (smartTool) {
    try {
      // Validate parameters
      const validated = smartTool.parameters.parse(args);
      
      // Execute smart handler
      const result = await smartTool.handler(validated);
      
      // Handle multiple operations (like universal search)
      if (Array.isArray(result)) {
        const responses = [];
        
        for (const op of result) {
          const tool = tools.find(t => t.name === op.operation);
          if (tool) {
            const response = await callTool(tool, cleanParameters(op.parameters));
            responses.push({
              type: op.type,
              data: JSON.parse(response.content[0].text)
            });
          }
        }
        
        // Handle large responses for multiple operations
        const handledResponses = await responseHandler.handleResponse(responses);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(handledResponses, null, 2)
            }
          ]
        };
      } else {
        // Single operation
        const tool = tools.find(t => t.name === result.operation);
        if (!tool) {
          throw new Error(`Unknown operation: ${result.operation}`);
        }
        
        return await callTool(tool, cleanParameters(result.parameters));
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: `Parameter validation error:\n${error.errors.map(e => `- ${e.path.join('.')}: ${e.message}`).join('\n')}`
            }
          ]
        };
      }
      throw error;
    }
  }
  
  // Fallback to regular tool
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  
  return await callTool(tool, args);
});

async function callTool(tool: ToolDefinition, args: any): Promise<{ content: TextContent[] }> {
  try {
    let url = tool.path;
    const config: any = {
      params: {}
    };
    
    // Apply smart defaults for pagination
    if (tool.parameters.some(p => p.name === 'Skip' || p.name === 'Take')) {
      if (args.Skip === undefined) {
        args.Skip = DEFAULTS.DEFAULT_SKIP;
      }
      if (args.Take === undefined) {
        args.Take = DEFAULTS.PAGE_SIZE;
      }
      // Enforce maximum page size
      if (args.Take > DEFAULTS.MAX_PAGE_SIZE) {
        args.Take = DEFAULTS.MAX_PAGE_SIZE;
      }
    }
    
    // Handle parameters
    for (const param of tool.parameters) {
      const value = args[param.name];
      
      if (value !== undefined) {
        if (param.in === 'path') {
          url = url.replace(`{${param.name}}`, encodeURIComponent(value));
        } else if (param.in === 'query') {
          config.params[param.name] = value;
        }
      }
    }
    
    const response = await httpClient.get(url, config);
    
    // Add pagination info if applicable
    let result = response.data;
    if (args.Skip !== undefined && args.Take !== undefined) {
      const totalCount = Array.isArray(result) ? result.length : 
                        (result.totalCount || result.count || 'unknown');
      
      result = {
        data: result,
        pagination: {
          skip: args.Skip,
          take: args.Take,
          page: Math.floor(args.Skip / args.Take) + 1,
          totalCount: totalCount,
          hasMore: Array.isArray(result) && result.length === args.Take
        }
      };
    }
    
    // Handle large responses
    const handledResult = await responseHandler.handleResponse(result);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(handledResult, null, 2)
        }
      ]
    };
  } catch (error: any) {
    process.stderr.write(`Error calling ${tool.name}: ${error.message}\n`);
    
    if (error.response) {
      // Enhanced error messages with helpful suggestions
      let errorMessage = `Error: ${error.response.status} ${error.response.statusText}\n`;
      
      if (error.response.data) {
        const data = error.response.data;
        if (data.Message) {
          errorMessage += `\nMessage: ${data.Message}`;
          
          // Provide helpful suggestions for common errors
          if (data.Message.includes('not be null')) {
            const paramMatch = data.Message.match(/Parameter '([^']+)'/);
            if (paramMatch) {
              const paramName = paramMatch[1];
              errorMessage += `\n\n💡 Suggestion: This endpoint requires the '${paramName}' parameter.`;
              errorMessage += `\n\nTry using a smart tool instead:`;
              
              // Suggest appropriate smart tools
              if (tool.path.includes('infobox')) {
                errorMessage += `\n- list_document_folders: List folders without needing IDs`;
                errorMessage += `\n- get_documents_in_folder: Get documents with folder ID`;
              } else if (tool.path.includes('common')) {
                errorMessage += `\n- get_messages: Get messages without needing IDs`;
                errorMessage += `\n- get_company_info: Get company information`;
              }
            }
          }
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: errorMessage
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ]
      };
    }
  }
}

// Initialize and start server
async function main() {
  await authenticate();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  process.stderr.write('IOP Ticketing MCP Enhanced server running on stdio\n');
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});