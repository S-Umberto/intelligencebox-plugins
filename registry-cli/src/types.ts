export interface MCPConfigParam {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  default?: any;
  pattern?: string;
}

export interface MCPRegistry {
  _id?: string;
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  icon?: string;
  category: string;
  tags: string[];
  dockerImage: string;
  dockerTag?: string;
  configSchema: Record<string, MCPConfigParam>;
  requirements?: {
    minMemory?: string;
    minCpu?: number;
    capabilities?: string[];
  };
  enabled: boolean;
  visibility: 'public' | 'private' | 'beta';
  featured?: boolean;
  documentationUrl?: string;
  sourceRepo?: string;
  createdAt?: Date;
  updatedAt?: Date;
}