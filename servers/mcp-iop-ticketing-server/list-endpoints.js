#!/usr/bin/env node
import axios from 'axios';

const SWAGGER_URL = 'https://ticketing.iopgroup.it/IM.core.api.Radix/swagger/v1/swagger.json';

async function listEndpoints() {
  try {
    console.log('Fetching Swagger specification...\n');
    const response = await axios.get(SWAGGER_URL);
    const spec = response.data;
    
    const endpoints = [];
    
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (pathItem.get) {
        const operation = pathItem.get;
        endpoints.push({
          path: path,
          operationId: operation.operationId || path.replace(/[^a-zA-Z0-9]/g, '_'),
          summary: operation.summary || 'No description',
          parameters: (operation.parameters || []).map(p => ({
            name: p.name,
            in: p.in,
            required: p.required || false,
            type: p.schema?.type || 'string'
          }))
        });
      }
    }
    
    console.log(`Found ${endpoints.length} GET endpoints:\n`);
    
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    
    for (const endpoint of endpoints) {
      console.log(`\n${endpoint.path}`);
      console.log(`  Tool name: ${endpoint.operationId}`);
      console.log(`  Description: ${endpoint.summary}`);
      
      if (endpoint.parameters.length > 0) {
        console.log('  Parameters:');
        for (const param of endpoint.parameters) {
          const required = param.required ? ' (required)' : '';
          console.log(`    - ${param.name} (${param.in}): ${param.type}${required}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error fetching Swagger spec:', error.message);
    process.exit(1);
  }
}

listEndpoints();