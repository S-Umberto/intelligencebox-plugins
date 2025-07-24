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
import ToolHelper from './tool-helper.js';

dotenv.config();

const API_BASE_URL = process.env.IOP_API_URL || 'https://ticketing.iopgroup.it/IM.core.api.Radix';
const API_KEY = process.env.IOP_API_KEY;
const SWAGGER_URL = `${API_BASE_URL}/swagger/v1/swagger.json`;

interface ToolDefinition {
  name: string;
  description: string;
  path: string;
  parameters: any[];
}

interface ClusteredTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  categoryTools: string[];
  categoryInfo: any;
}

let swaggerSpec: any = null;
let tools: ToolDefinition[] = [];
let clusteredTools: ClusteredTool[] = [];
let authToken: string | null = null;
const toolHelper = new ToolHelper();

const server = new Server({
  name: 'iop-ticketing-mcp',
  version: '1.0.0'
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

async function authenticate(): Promise<void> {
  if (!API_KEY) {
    // Use stderr for warnings to not interfere with stdio protocol
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
    if (error.response?.data) {
      process.stderr.write(`Response: ${JSON.stringify(error.response.data)}\n`);
    }
  }
}

// Convert OpenAPI/Swagger schema to Zod schema
function openApiToZod(schema: any): z.ZodSchema {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  const { type, properties, required = [], enum: enumValues, items, format } = schema;

  switch (type) {
    case 'string':
      let stringSchema = z.string();
      
      if (enumValues && Array.isArray(enumValues)) {
        const [first, ...rest] = enumValues;
        return z.enum([first, ...rest] as [string, ...string[]]);
      }
      
      if (format === 'date-time') {
        return stringSchema.datetime();
      } else if (format === 'date') {
        return stringSchema.date();
      } else if (format === 'email') {
        return stringSchema.email();
      } else if (format === 'uuid') {
        return stringSchema.uuid();
      }
      
      return stringSchema;
      
    case 'number':
      return z.number();
      
    case 'integer':
      return z.number().int();
      
    case 'boolean':
      return z.boolean();
      
    case 'array':
      if (items) {
        return z.array(openApiToZod(items));
      }
      return z.array(z.any());
      
    case 'object':
      if (!properties) {
        return z.record(z.any());
      }
      
      const shape: Record<string, z.ZodSchema> = {};
      
      for (const [key, prop] of Object.entries(properties)) {
        let zodType = openApiToZod(prop as any);
        
        // Add description if available
        if ((prop as any).description) {
          zodType = zodType.describe((prop as any).description);
        }
        
        // Make optional if not in required array
        if (!required.includes(key)) {
          zodType = zodType.optional();
        }
        
        shape[key] = zodType;
      }
      
      return z.object(shape);
      
    default:
      return z.any();
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
    
    // Create clustered tools
    createClusteredTools();
  } catch (error: any) {
    process.stderr.write(`Failed to load Swagger spec: ${error.message}\n`);
    throw error;
  }
}

function createClusteredTools(): void {
  const categories = toolHelper.getAllCategories();
  
  for (const category of categories) {
    // Get all tools in this category and check which ones require parameters
    const categoryToolsWithParams = category.tools.map(toolName => {
      const tool = tools.find(t => t.name === toolName);
      const requiredParams = tool?.parameters.filter(p => p.required) || [];
      return {
        name: toolName,
        hasRequiredParams: requiredParams.length > 0,
        requiredParams: requiredParams.map(p => p.name)
      };
    });
    
    // Build a description that indicates which operations need parameters
    const toolsNeedingParams = categoryToolsWithParams.filter(t => t.hasRequiredParams);
    let enhancedDescription = `${category.icon} ${category.name}: ${category.description}`;
    
    if (toolsNeedingParams.length > 0) {
      enhancedDescription += `\n\nNote: Some operations require parameters:`;
      toolsNeedingParams.forEach(t => {
        enhancedDescription += `\n- ${t.name}: requires ${t.requiredParams.join(', ')}`;
      });
    }
    
    // Create Zod schema for the clustered tool
    const zodSchema = z.object({
      operation: z.enum(category.tools as [string, ...string[]]).describe('The specific operation to perform'),
      parameters: z.record(z.any()).optional().describe('Parameters for the selected operation (check operation requirements)')
    });
    
    const clusteredTool: ClusteredTool = {
      name: `${category.id}_cluster`,
      description: enhancedDescription,
      inputSchema: zodSchema,
      categoryTools: category.tools,
      categoryInfo: category
    };
    
    clusteredTools.push(clusteredTool);
  }
  
  process.stderr.write(`Created ${clusteredTools.length} clustered tools from ${tools.length} endpoints\n`);
}

// Convert Zod schema to JSON Schema for MCP protocol
function zodToJsonSchema(schema: z.ZodSchema): any {
  // This is a simplified conversion - in production you might use zod-to-json-schema
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  } else if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  } else if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  } else if (schema instanceof z.ZodArray) {
    return { 
      type: 'array',
      items: zodToJsonSchema((schema as any)._def.type)
    };
  } else if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodSchema);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  } else if (schema instanceof z.ZodEnum) {
    const values = (schema as any)._def.values;
    return {
      type: 'string',
      enum: values
    };
  } else if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any)._def.innerType);
  } else if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: true
    };
  }
  
  return { type: 'any' };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!swaggerSpec) {
    await loadSwaggerSpec();
  }
  
  // Return clustered tools with proper JSON schema
  const useClusteredTools = process.env.USE_CLUSTERED_TOOLS !== 'false';
  
  if (useClusteredTools) {
    return {
      tools: clusteredTools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema: zodToJsonSchema(inputSchema)
      }))
    };
  } else {
    // Return all individual tools
    const allTools: Tool[] = [];
    
    for (const tool of tools) {
      // Build Zod schema from OpenAPI parameters
      const shape: Record<string, z.ZodSchema> = {};
      const required: string[] = [];
      
      for (const param of tool.parameters) {
        const paramSchema = param.schema || { type: 'string' };
        shape[param.name] = openApiToZod(paramSchema);
        
        if (param.required) {
          required.push(param.name);
        }
      }
      
      const zodSchema = z.object(shape);
      
      allTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(zodSchema)
      });
    }
    
    return { tools: allTools };
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
    
    // Validate input with Zod
    const validated = clusteredTool.inputSchema.parse(args);
    
    // Extract the actual tool name and parameters
    const actualToolName = validated.operation;
    const actualParameters = validated.parameters || {};
    
    // Find the actual tool
    const tool = tools.find(t => t.name === actualToolName);
    if (!tool) {
      throw new Error(`Unknown operation: ${actualToolName}`);
    }
    
    // Call the actual tool with the parameters
    return await callTool(tool, actualParameters);
  }
  
  // Regular tool call
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
    
    // Check for required parameters
    const missingParams: string[] = [];
    
    // Handle path parameters and query parameters
    for (const param of tool.parameters) {
      const value = args[param.name];
      
      if (param.required && value === undefined) {
        missingParams.push(`${param.name} (${param.in})`);
      }
      
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
    
    // If there are missing required parameters, return an informative error
    if (missingParams.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Missing required parameters: ${missingParams.join(', ')}\n\nThis endpoint requires the following parameters:\n${
              tool.parameters
                .filter(p => p.required)
                .map(p => `- ${p.name} (${p.in}): ${p.description || 'No description'}`)
                .join('\n')
            }`
          }
        ]
      };
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
  } catch (error: any) {
    process.stderr.write(`Error calling ${tool.name}: ${error.message}\n`);
    
    if (error.response) {
      // Parse error message for more helpful feedback
      let errorMessage = `Error: ${error.response.status} ${error.response.statusText}\n`;
      
      if (error.response.data) {
        const data = error.response.data;
        if (data.Message) {
          errorMessage += `\nMessage: ${data.Message}`;
          
          // Provide helpful hints for common errors
          if (data.Message.includes('Not supported empty')) {
            const paramName = data.Message.match(/Not supported empty (\w+)/)?.[1];
            if (paramName) {
              errorMessage += `\n\nHint: This endpoint requires the '${paramName}' parameter to be provided.`;
              
              // Find the parameter in the tool definition
              const param = tool.parameters.find(p => p.name === paramName || p.name.toLowerCase() === paramName.toLowerCase());
              if (param) {
                errorMessage += `\n- ${param.name}: ${param.description || 'No description available'}`;
              }
            }
          }
        } else {
          errorMessage += JSON.stringify(data, null, 2);
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

// Initialize and start the server
async function main() {
  // Authenticate first if API key is available
  await authenticate();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  process.stderr.write('IOP Ticketing MCP server running on stdio\n');
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});