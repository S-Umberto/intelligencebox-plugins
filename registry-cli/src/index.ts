#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'table';
import { MCPRegistryAPIClient } from './api-client.js';
import { MCPRegistry, MCPConfigParam } from './types.js';

const apiClient = new MCPRegistryAPIClient();

const program = new Command();

program
  .name('mcp-registry')
  .description('CLI tool for managing MCP registry')
  .version('1.0.0');

// List command
program
  .command('list')
  .description('List all MCPs in the registry')
  .option('-c, --category <category>', 'Filter by category')
  .option('-f, --featured', 'Show only featured MCPs')
  .option('-s, --search <search>', 'Search MCPs')
  .action(async (options) => {
    const spinner = ora('Fetching MCPs...').start();
    
    try {
      const filters: any = {};
      if (options.category) filters.category = options.category;
      if (options.featured) filters.featured = true;
      if (options.search) filters.search = options.search;
      
      const mcps = await apiClient.list(filters);
      spinner.succeed(`Found ${mcps.length} MCPs`);
      
      if (mcps.length === 0) {
        console.log(chalk.yellow('No MCPs found'));
        return;
      }
      
      const data = [
        ['ID', 'Name', 'Category', 'Version', 'Enabled', 'Visibility'],
        ...mcps.map(mcp => [
          mcp.id,
          mcp.name,
          mcp.category,
          mcp.version || '1.0.0',
          mcp.enabled ? chalk.green('✓') : chalk.red('✗'),
          mcp.visibility
        ])
      ];
      
      console.log(table(data));
    } catch (error: any) {
      spinner.fail('Failed to fetch MCPs');
      console.error(chalk.red(error.message));
    }
  });

// Get command
program
  .command('get <id>')
  .description('Get details of a specific MCP')
  .action(async (id) => {
    const spinner = ora('Fetching MCP...').start();
    
    try {
      const mcp = await apiClient.get(id);
      
      if (!mcp) {
        spinner.fail(`MCP '${id}' not found`);
        return;
      }
      
      spinner.succeed(`Found MCP '${id}'`);
      
      console.log('\n' + chalk.bold.blue('MCP Details:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.bold('ID:')} ${mcp.id}`);
      console.log(`${chalk.bold('Name:')} ${mcp.name}`);
      console.log(`${chalk.bold('Description:')} ${mcp.description}`);
      console.log(`${chalk.bold('Author:')} ${mcp.author}`);
      console.log(`${chalk.bold('Version:')} ${mcp.version || '1.0.0'}`);
      console.log(`${chalk.bold('Category:')} ${mcp.category}`);
      console.log(`${chalk.bold('Tags:')} ${mcp.tags.join(', ')}`);
      console.log(`${chalk.bold('Docker Image:')} ${mcp.dockerImage}:${mcp.dockerTag || 'latest'}`);
      console.log(`${chalk.bold('Enabled:')} ${mcp.enabled ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`${chalk.bold('Visibility:')} ${mcp.visibility}`);
      
      if (mcp.documentationUrl) {
        console.log(`${chalk.bold('Documentation:')} ${mcp.documentationUrl}`);
      }
      
      if (Object.keys(mcp.configSchema).length > 0) {
        console.log('\n' + chalk.bold('Configuration Parameters:'));
        for (const [key, param] of Object.entries(mcp.configSchema)) {
          console.log(`  ${chalk.cyan(key)} (${param.type}${param.required ? ', required' : ''})`);
          console.log(`    ${param.description}`);
          if (param.default !== undefined) {
            console.log(`    Default: ${param.default}`);
          }
        }
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch MCP');
      console.error(chalk.red(error.message));
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search for MCPs')
  .action(async (query) => {
    const spinner = ora('Searching...').start();
    
    try {
      const mcps = await apiClient.search(query);
      
      spinner.succeed(`Found ${mcps.length} MCPs matching '${query}'`);
      
      if (mcps.length === 0) {
        return;
      }
      
      const data = [
        ['ID', 'Name', 'Category', 'Description'],
        ...mcps.map(mcp => [
          mcp.id,
          mcp.name,
          mcp.category,
          mcp.description.length > 50 ? mcp.description.substring(0, 50) + '...' : mcp.description
        ])
      ];
      
      console.log(table(data));
      
    } catch (error: any) {
      spinner.fail('Search failed');
      console.error(chalk.red(error.message));
    }
  });

// Categories command
program
  .command('categories')
  .description('List all available categories')
  .action(async () => {
    const spinner = ora('Fetching categories...').start();
    
    try {
      const categories = await apiClient.getCategories();
      spinner.succeed(`Found ${categories.length} categories`);
      
      console.log('\n' + chalk.bold('Available Categories:'));
      categories.forEach(cat => console.log(`  • ${cat}`));
      
    } catch (error: any) {
      spinner.fail('Failed to fetch categories');
      console.error(chalk.red(error.message));
    }
  });

// Admin commands (would need authentication in production)
console.log(chalk.yellow('\nNote: Admin commands (add, edit, delete, import) require direct database access.'));
console.log(chalk.yellow('For production use, these should be protected with authentication.\n'));

// Add command
program
  .command('add')
  .description('Add a new MCP to the registry (admin only)')
  .action(async () => {
    console.log(chalk.yellow('This command requires admin access to the database.'));
    console.log(chalk.yellow('Please use the web admin interface or direct database access.'));
  });

// Edit command
program
  .command('edit <id>')
  .description('Edit an existing MCP (admin only)')
  .action(async (id) => {
    console.log(chalk.yellow('This command requires admin access to the database.'));
    console.log(chalk.yellow('Please use the web admin interface or direct database access.'));
  });

// Delete command
program
  .command('delete <id>')
  .description('Delete an MCP from the registry (admin only)')
  .action(async (id) => {
    console.log(chalk.yellow('This command requires admin access to the database.'));
    console.log(chalk.yellow('Please use the web admin interface or direct database access.'));
  });

// Import command - This could be implemented as a helper that generates JSON
program
  .command('import <file>')
  .description('Generate import JSON from manifest.json file')
  .option('--save', 'Save directly to the registry database')
  .action(async (file, options) => {
    const spinner = ora('Reading manifest...').start();
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const manifestPath = path.resolve(file);
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);
      
      spinner.succeed('Manifest loaded successfully');
      
      const mcp: Omit<MCPRegistry, '_id' | 'createdAt' | 'updatedAt'> = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        version: manifest.version || '1.0.0',
        icon: manifest.icon || '🔧',
        category: manifest.category || 'custom',
        tags: manifest.tags || [],
        dockerImage: manifest.dockerImage,
        dockerTag: manifest.dockerTag || 'latest',
        configSchema: manifest.configSchema || {},
        requirements: manifest.requirements,
        enabled: true,
        visibility: 'public',
        featured: false,
        documentationUrl: manifest.documentationUrl,
        sourceRepo: manifest.sourceRepo
      };
      
      console.log('\n' + chalk.bold('Generated MCP configuration:'));
      console.log(JSON.stringify(mcp, null, 2));
      
      if (options.save) {
        // Ask for password
        const { password } = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter admin password:',
            mask: '*'
          }
        ]);
        
        // Save to database via admin API with password
        const saveSpinner = ora('Saving to registry...').start();
        try {
          const result = await apiClient.upsertWithAuth(mcp, password);
          saveSpinner.succeed('MCP saved to registry successfully!');
          console.log(chalk.green(`\n✔ ${mcp.name} has been saved to the registry`));
          
          // Check if it was updated (by checking if the MCP already existed)
          if (result && result.updatedAt !== result.createdAt) {
            console.log(chalk.yellow('  (Updated existing MCP)'));
          }
        } catch (error: any) {
          saveSpinner.fail('Failed to save to registry');
          if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            console.error(chalk.red('Invalid password'));
          } else {
            console.error(chalk.red(error.message));
          }
        }
      } else {
        console.log('\n' + chalk.green('To add this MCP to the registry:'));
        console.log('1. Copy the JSON above');
        console.log('2. Use the admin interface or direct database access to add it');
        console.log('   Or run with --save flag to save directly');
      }
      
    } catch (error: any) {
      spinner.fail('Failed to read manifest');
      console.error(chalk.red(error.message));
    }
  });

program.parse(process.argv);