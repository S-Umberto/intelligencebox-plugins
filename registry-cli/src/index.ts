#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'table';
import { MCPRegistryAPIClient } from './api-client.js';
import { MCPRegistry, MCPConfigParam } from './types.js';
import figlet from 'figlet';
import boxen from 'boxen';
import { MCPRegistryMenu } from './menu.js';

const apiClient = new MCPRegistryAPIClient();

const program = new Command();

program
  .name('mcp-registry')
  .description('CLI tool for managing Model Context Protocol registry')
  .version('1.0.0');

// Display banner for CLI commands
if (process.argv.length > 2 && process.argv[2] !== 'menu') {
  console.log(chalk.cyan(figlet.textSync('MCP Registry', { horizontalLayout: 'fitted' })));
  console.log(chalk.gray('━'.repeat(60)));
  console.log();
}

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
      
      const tableConfig = {
        border: {
          topBody: chalk.gray('─'),
          topJoin: chalk.gray('┬'),
          topLeft: chalk.gray('┌'),
          topRight: chalk.gray('┐'),
          bottomBody: chalk.gray('─'),
          bottomJoin: chalk.gray('┴'),
          bottomLeft: chalk.gray('└'),
          bottomRight: chalk.gray('┘'),
          bodyLeft: chalk.gray('│'),
          bodyRight: chalk.gray('│'),
          bodyJoin: chalk.gray('│'),
          joinBody: chalk.gray('─'),
          joinLeft: chalk.gray('├'),
          joinRight: chalk.gray('┤'),
          joinJoin: chalk.gray('┼')
        },
        columns: [
          { alignment: 'left' },
          { alignment: 'left' },
          { alignment: 'left' },
          { alignment: 'center' },
          { alignment: 'center' },
          { alignment: 'center' }
        ]
      };
      
      const data = [
        [
          chalk.bold.cyan('ID'),
          chalk.bold.cyan('Name'),
          chalk.bold.cyan('Category'),
          chalk.bold.cyan('Version'),
          chalk.bold.cyan('Enabled'),
          chalk.bold.cyan('Visibility')
        ],
        ...mcps.map(mcp => [
          chalk.white(mcp.id),
          chalk.bold(mcp.name),
          chalk.magenta(mcp.category),
          chalk.dim(mcp.version || '1.0.0'),
          mcp.enabled ? chalk.green('✓ Yes') : chalk.red('✗ No'),
          mcp.visibility === 'public' ? chalk.green('Public') : chalk.yellow('Private')
        ])
      ];
      
      console.log(table(data, tableConfig));
    } catch (error: any) {
      spinner.fail('Failed to fetch MCPs');
      
      const errorBox = boxen(
        chalk.red(error.message),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          title: chalk.bold.red('❌ Error'),
          titleAlignment: 'center'
        }
      );
      console.error(errorBox);
      
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.log(chalk.dim('\nTip: Check your internet connection and API URL in .env file'));
      }
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
      
      const details = boxen(
        [
          `${chalk.bold.cyan('ID:')} ${mcp.id}`,
          `${chalk.bold.cyan('Name:')} ${chalk.bold(mcp.name)}`,
          `${chalk.bold.cyan('Description:')} ${mcp.description}`,
          `${chalk.bold.cyan('Author:')} ${chalk.magenta(mcp.author)}`,
          `${chalk.bold.cyan('Version:')} ${chalk.dim(mcp.version || '1.0.0')}`,
          `${chalk.bold.cyan('Category:')} ${chalk.magenta(mcp.category)}`,
          `${chalk.bold.cyan('Tags:')} ${mcp.tags.map(tag => chalk.blue(`#${tag}`)).join(' ')}`,
          `${chalk.bold.cyan('Docker:')} ${chalk.gray(`${mcp.dockerImage}:${mcp.dockerTag || 'latest'}`)}`,
          `${chalk.bold.cyan('Status:')} ${mcp.enabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled')}`,
          `${chalk.bold.cyan('Visibility:')} ${mcp.visibility === 'public' ? chalk.green('Public') : chalk.yellow('Private')}`
        ].join('\n'),
        {
          title: chalk.bold.blue('MCP Details'),
          titleAlignment: 'center',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue'
        }
      );
      
      console.log(details);
      
      if (mcp.documentationUrl) {
        console.log(`${chalk.bold('Documentation:')} ${mcp.documentationUrl}`);
      }
      
      if (Object.keys(mcp.configSchema).length > 0) {
        const configBox = boxen(
          Object.entries(mcp.configSchema)
            .map(([key, param]) => {
              const parts = [
                `${chalk.bold.cyan(key)} ${chalk.gray(`(${param.type}${param.required ? ', required' : ''})`)}`
              ];
              parts.push(`  ${chalk.dim(param.description)}`);
              if (param.default !== undefined) {
                parts.push(`  ${chalk.gray('Default:')} ${chalk.green(param.default)}`);
              }
              return parts.join('\n');
            })
            .join('\n\n'),
          {
            title: chalk.bold.yellow('Configuration Parameters'),
            titleAlignment: 'center',
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow'
          }
        );
        console.log(configBox);
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch MCP');
      
      const errorBox = boxen(
        chalk.red(error.message),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          title: chalk.bold.red('❌ Error'),
          titleAlignment: 'center'
        }
      );
      console.error(errorBox);
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
      
      const tableConfig = {
        border: {
          topBody: chalk.gray('─'),
          topJoin: chalk.gray('┬'),
          topLeft: chalk.gray('┌'),
          topRight: chalk.gray('┐'),
          bottomBody: chalk.gray('─'),
          bottomJoin: chalk.gray('┴'),
          bottomLeft: chalk.gray('└'),
          bottomRight: chalk.gray('┘'),
          bodyLeft: chalk.gray('│'),
          bodyRight: chalk.gray('│'),
          bodyJoin: chalk.gray('│'),
          joinBody: chalk.gray('─'),
          joinLeft: chalk.gray('├'),
          joinRight: chalk.gray('┤'),
          joinJoin: chalk.gray('┼')
        },
        columns: [
          { alignment: 'left', width: 20 },
          { alignment: 'left', width: 25 },
          { alignment: 'left', width: 15 },
          { alignment: 'left', width: 50 }
        ],
        wordWrap: true
      };
      
      const data = [
        [
          chalk.bold.cyan('ID'),
          chalk.bold.cyan('Name'),
          chalk.bold.cyan('Category'),
          chalk.bold.cyan('Description')
        ],
        ...mcps.map(mcp => [
          chalk.white(mcp.id),
          chalk.bold(mcp.name),
          chalk.magenta(mcp.category),
          chalk.dim(mcp.description.length > 50 ? mcp.description.substring(0, 50) + '...' : mcp.description)
        ])
      ];
      
      console.log(table(data, tableConfig));
      
    } catch (error: any) {
      spinner.fail('Search failed');
      
      const errorBox = boxen(
        chalk.red(error.message),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          title: chalk.bold.red('❌ Error'),
          titleAlignment: 'center'
        }
      );
      console.error(errorBox);
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
      
      const categoryBox = boxen(
        categories.map(cat => `${chalk.cyan('•')} ${chalk.bold(cat)}`).join('\n'),
        {
          title: chalk.bold.magenta('Available Categories'),
          titleAlignment: 'center',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'magenta'
        }
      );
      console.log(categoryBox);
      
    } catch (error: any) {
      spinner.fail('Failed to fetch categories');
      
      const errorBox = boxen(
        chalk.red(error.message),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          title: chalk.bold.red('❌ Error'),
          titleAlignment: 'center'
        }
      );
      console.error(errorBox);
    }
  });


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

// Interactive menu command (default)
program
  .command('menu', { isDefault: true })
  .description('Launch interactive menu (default)')
  .action(async () => {
    const menu = new MCPRegistryMenu();
    await menu.start();
  });

program.parse(process.argv);

// If no command is provided, show the interactive menu
if (process.argv.length === 2) {
  const menu = new MCPRegistryMenu();
  menu.start().catch(console.error);
}