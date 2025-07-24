import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';

const MAX_RESPONSE_SIZE = 100_000; // 100KB limit for direct responses
const TEMP_DIR = '/tmp/mcp-iop-responses';

export interface StoredResponse {
  id: string;
  timestamp: number;
  size: number;
  summary: {
    totalItems?: number;
    firstItems?: any[];
    structure?: string;
  };
}

export class LargeResponseHandler {
  private responses: Map<string, StoredResponse> = new Map();

  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async handleResponse(data: any): Promise<any> {
    const jsonString = JSON.stringify(data);
    const size = jsonString.length;

    // If response is small enough, return it directly
    if (size <= MAX_RESPONSE_SIZE) {
      return data;
    }

    // Generate unique ID for this response
    const id = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(TEMP_DIR, `${id}.json`);

    // Save full response to file
    await fs.writeFile(filePath, jsonString);

    // Create summary
    const summary = this.createSummary(data);

    // Store metadata
    const metadata: StoredResponse = {
      id,
      timestamp: Date.now(),
      size,
      summary
    };
    this.responses.set(id, metadata);
    
    // Log for debugging
    console.error(`[LargeResponseHandler] Stored response ${id} (${(size / 1024 / 1024).toFixed(2)}MB)`);

    // Clean up old responses (older than 1 hour)
    this.cleanupOldResponses();

    // Return abbreviated response with navigation instructions
    return {
      _large_response: true,
      response_id: id,
      size_bytes: size,
      size_mb: (size / 1024 / 1024).toFixed(2),
      summary,
      message: `Response too large (${(size / 1024 / 1024).toFixed(2)}MB). Use navigation tools to explore:`,
      available_tools: [
        'navigate_response - Browse the saved response structure',
        'query_response - Query specific paths in the response',
        'filter_response - Filter array results',
        'export_response - Export full or partial response'
      ]
    };
  }

  private createSummary(data: any): any {
    const summary: any = {};

    if (Array.isArray(data)) {
      summary.totalItems = data.length;
      summary.firstItems = data.slice(0, 3);
      summary.structure = 'array';
      if (data.length > 0 && typeof data[0] === 'object') {
        summary.itemKeys = Object.keys(data[0]).slice(0, 10);
      }
    } else if (typeof data === 'object' && data !== null) {
      summary.structure = 'object';
      summary.keys = Object.keys(data).slice(0, 20);
      
      // Check for common patterns
      if (data.data && Array.isArray(data.data)) {
        summary.dataArrayLength = data.data.length;
        summary.hasDataArray = true;
      }
    }

    return summary;
  }

  async navigateResponse(responseId: string, navigationPath: string = ''): Promise<any> {
    const metadata = this.responses.get(responseId);
    if (!metadata) {
      throw new Error(`Response ${responseId} not found. Available responses: ${Array.from(this.responses.keys()).join(', ') || 'none'}`);
    }

    const filePath = path.join(TEMP_DIR, `${responseId}.json`);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Navigate to path if provided
      let current = data;
      if (navigationPath) {
        const parts = navigationPath.split('.');
        for (const part of parts) {
          if (current === null || current === undefined) {
            throw new Error(`Cannot navigate to '${part}' - parent is ${current}`);
          }
          
          if (part.includes('[') && part.includes(']')) {
            // Handle array access
            const [arrayName, indexStr] = part.split('[');
            const index = parseInt(indexStr.replace(']', ''));
            
            if (arrayName) {
              if (!(arrayName in current)) {
                throw new Error(`Property '${arrayName}' not found in current object`);
              }
              if (!Array.isArray(current[arrayName])) {
                throw new Error(`Property '${arrayName}' is not an array`);
              }
              if (index < 0 || index >= current[arrayName].length) {
                throw new Error(`Array index ${index} out of bounds for '${arrayName}' (length: ${current[arrayName].length})`);
              }
              current = current[arrayName][index];
            } else {
              if (!Array.isArray(current)) {
                throw new Error(`Cannot access index ${index} - current value is not an array`);
              }
              if (index < 0 || index >= current.length) {
                throw new Error(`Array index ${index} out of bounds (length: ${current.length})`);
              }
              current = current[index];
            }
          } else {
            if (typeof current !== 'object' || current === null) {
              throw new Error(`Cannot access property '${part}' - current value is ${typeof current}`);
            }
            if (!(part in current)) {
              const availableKeys = Object.keys(current).slice(0, 10).join(', ');
              throw new Error(`Property '${part}' not found. Available keys: ${availableKeys}${Object.keys(current).length > 10 ? '...' : ''}`);
            }
            current = current[part];
          }
        }
      }

      // Return navigated data with size check
      const result = JSON.stringify(current);
      if (result.length > MAX_RESPONSE_SIZE) {
        return this.handleResponse(current);
      }
      
      return current;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Response file not found for ${responseId}. It may have been cleaned up.`);
      }
      throw error;
    }
  }

  async queryResponse(responseId: string, query: {
    path?: string;
    filter?: Record<string, any>;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      const data = await this.navigateResponse(responseId, query.path || '');
      
      if (!data) {
        throw new Error(`No data found at path: ${query.path || 'root'}`);
      }
      
      if (Array.isArray(data)) {
        let results = data;
        
        // Apply filters
        if (query.filter && Object.keys(query.filter).length > 0) {
          results = results.filter(item => {
            if (!item || typeof item !== 'object') return false;
            
            return Object.entries(query.filter!).every(([key, value]) => {
              // Handle nested property access with dot notation
              const keys = key.split('.');
              let current = item;
              
              for (const k of keys) {
                if (current && typeof current === 'object' && k in current) {
                  current = current[k];
                } else {
                  return false;
                }
              }
              
              // Handle different comparison types
              if (typeof value === 'object' && value !== null) {
                // Handle range queries
                if ('$gte' in value || '$lte' in value || '$gt' in value || '$lt' in value) {
                  const currentValue = new Date(current).getTime();
                  if ('$gte' in value && currentValue < new Date(value.$gte).getTime()) return false;
                  if ('$lte' in value && currentValue > new Date(value.$lte).getTime()) return false;
                  if ('$gt' in value && currentValue <= new Date(value.$gt).getTime()) return false;
                  if ('$lt' in value && currentValue >= new Date(value.$lt).getTime()) return false;
                  return true;
                }
              }
              
              return current === value;
            });
          });
        }
        
        // Apply pagination
        const offset = query.offset || 0;
        const limit = query.limit || 20;
        const paginatedResults = results.slice(offset, offset + limit);
        
        return {
          results: paginatedResults,
          total: results.length,
          offset,
          limit,
          hasMore: offset + limit < results.length,
          message: `Showing ${paginatedResults.length} of ${results.length} results`
        };
      }
      
      // If not an array, return the data as-is with metadata
      return {
        data,
        type: typeof data,
        message: 'Data is not an array, returning as-is'
      };
    } catch (error: any) {
      throw new Error(`Failed to query response ${responseId}: ${error.message}`);
    }
  }

  private cleanupOldResponses() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [id, metadata] of this.responses.entries()) {
      if (metadata.timestamp < oneHourAgo) {
        this.responses.delete(id);
        // Delete file
        fs.unlink(path.join(TEMP_DIR, `${id}.json`)).catch(() => {});
      }
    }
  }

  async exportResponse(responseId: string, outputPath: string, options?: {
    path?: string;
    format?: 'json' | 'csv';
  }): Promise<string> {
    const data = await this.navigateResponse(responseId, options?.path);
    
    if (options?.format === 'csv' && Array.isArray(data)) {
      // Simple CSV export for arrays
      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(','),
        ...data.map(item => headers.map(h => JSON.stringify(item[h] || '')).join(','))
      ].join('\n');
      
      await fs.writeFile(outputPath, csv);
      return `Exported ${data.length} items to ${outputPath}`;
    } else {
      // JSON export
      await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
      return `Exported to ${outputPath}`;
    }
  }
}

// Navigation tools schemas
export const NavigateResponseSchema = z.object({
  response_id: z.string().describe('The ID of the stored response'),
  path: z.string().optional().describe('Dot-notation path to navigate (e.g., "data.customers[0]")')
});

export const QueryResponseSchema = z.object({
  response_id: z.string().describe('The ID of the stored response'),
  path: z.string().optional().describe('Path to the array to query'),
  filter: z.record(z.any()).optional().describe('Key-value pairs to filter results'),
  limit: z.number().optional().default(20).describe('Maximum results to return'),
  offset: z.number().optional().default(0).describe('Number of results to skip')
});

export const ExportResponseSchema = z.object({
  response_id: z.string().describe('The ID of the stored response'),
  output_path: z.string().describe('Path where to save the file'),
  path: z.string().optional().describe('Path to export a subset of data'),
  format: z.enum(['json', 'csv']).optional().default('json').describe('Export format')
});