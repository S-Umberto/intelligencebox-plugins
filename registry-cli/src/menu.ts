import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { table } from 'table';
import boxen from 'boxen';
import figlet from 'figlet';
import { MCPRegistryAPIClient } from './api-client.js';
import { MCPRegistry } from './types.js';

export class MCPRegistryMenu {
  private apiClient: MCPRegistryAPIClient;
  private shouldExit = false;

  constructor() {
    this.apiClient = new MCPRegistryAPIClient();
  }

  async start() {
    // Clear console and show banner
    console.clear();
    console.log(chalk.cyan(figlet.textSync('MCP Registry', { horizontalLayout: 'fitted' })));
    console.log(chalk.gray('\u2501'.repeat(60)));
    console.log(chalk.dim('Model Context Protocol Registry Manager v1.0.0'));
    console.log();

    while (!this.shouldExit) {
      try {
        await this.showMainMenu();
      } catch (error) {
        console.error(chalk.red('An unexpected error occurred. Please try again.'));
      }
    }

    console.log(chalk.cyan('\nThank you for using MCP Registry! Goodbye! \ud83d\udc4b'));
  }

  private async showMainMenu() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.bold('What would you like to do?'),
        choices: [
          { name: chalk.cyan('\ud83d\udccb List all MCPs'), value: 'list' },
          { name: chalk.cyan('\ud83d\udd0d Search MCPs'), value: 'search' },
          { name: chalk.cyan('\ud83d\udcc2 Browse by Category'), value: 'categories' },
          { name: chalk.cyan('\ud83c\udf1f View Featured MCPs'), value: 'featured' },
          { name: chalk.cyan('\ud83d\udd0e View MCP Details'), value: 'details' },
          new inquirer.Separator(),
          { name: chalk.yellow('\ud83d\udd12 Admin Functions'), value: 'admin' },
          new inquirer.Separator(),
          { name: chalk.red('\ud83d\udeaa Exit'), value: 'exit' }
        ],
        pageSize: 10
      }
    ]);

    switch (action) {
      case 'list':
        await this.listMCPs();
        break;
      case 'search':
        await this.searchMCPs();
        break;
      case 'categories':
        await this.browseByCategory();
        break;
      case 'featured':
        await this.listFeaturedMCPs();
        break;
      case 'details':
        await this.viewMCPDetails();
        break;
      case 'admin':
        await this.showAdminMenu();
        break;
      case 'exit':
        this.shouldExit = true;
        break;
    }
  }

  private async listMCPs(filters?: any) {
    const spinner = ora('Fetching MCPs...').start();
    
    try {
      const mcps = await this.apiClient.list(filters);
      spinner.succeed(`Found ${mcps.length} MCPs`);
      
      if (mcps.length === 0) {
        console.log(boxen(
          chalk.yellow('No MCPs found matching your criteria.'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow'
          }
        ));
        await this.pressEnterToContinue();
        return;
      }
      
      this.displayMCPTable(mcps);
      
      // Ask if user wants to view details of any MCP
      const { viewDetails } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewDetails',
          message: 'Would you like to view details of any MCP?',
          default: false
        }
      ]);

      if (viewDetails) {
        await this.selectAndViewMCP(mcps);
      } else {
        await this.pressEnterToContinue();
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch MCPs');
      this.showError(error.message);
      await this.pressEnterToContinue();
    }
  }

  private async listFeaturedMCPs() {
    await this.listMCPs({ featured: true });
  }

  private async searchMCPs() {
    const { query } = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: 'Enter search query:',
        validate: (input) => input.trim().length > 0 || 'Please enter a search query'
      }
    ]);

    const spinner = ora('Searching...').start();
    
    try {
      const mcps = await this.apiClient.search(query);
      
      spinner.succeed(`Found ${mcps.length} MCPs matching '${query}'`);
      
      if (mcps.length === 0) {
        await this.pressEnterToContinue();
        return;
      }
      
      this.displayMCPTable(mcps);
      
      const { viewDetails } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewDetails',
          message: 'Would you like to view details of any MCP?',
          default: false
        }
      ]);

      if (viewDetails) {
        await this.selectAndViewMCP(mcps);
      } else {
        await this.pressEnterToContinue();
      }
    } catch (error: any) {
      spinner.fail('Search failed');
      this.showError(error.message);
      await this.pressEnterToContinue();
    }
  }

  private async browseByCategory() {
    const spinner = ora('Fetching categories...').start();
    
    try {
      const categories = await this.apiClient.getCategories();
      spinner.succeed(`Found ${categories.length} categories`);
      
      const { category } = await inquirer.prompt([
        {
          type: 'list',
          name: 'category',
          message: 'Select a category:',
          choices: [
            ...categories.map(cat => ({
              name: `${chalk.magenta(cat)}`,
              value: cat
            })),
            new inquirer.Separator(),
            { name: chalk.gray('← Back to main menu'), value: null }
          ],
          pageSize: 15
        }
      ]);

      if (category) {
        await this.listMCPs({ category });
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch categories');
      this.showError(error.message);
      await this.pressEnterToContinue();
    }
  }

  private async viewMCPDetails() {
    const { mcpId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'mcpId',
        message: 'Enter MCP ID to view details:',
        validate: (input) => input.trim().length > 0 || 'Please enter an MCP ID'
      }
    ]);

    await this.fetchAndDisplayMCP(mcpId);
  }

  private async selectAndViewMCP(mcps: MCPRegistry[]) {
    const { selectedMcp } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedMcp',
        message: 'Select an MCP to view details:',
        choices: [
          ...mcps.map(mcp => ({
            name: `${chalk.bold(mcp.name)} (${mcp.id}) - ${chalk.magenta(mcp.category)}`,
            value: mcp.id
          })),
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: null }
        ],
        pageSize: 10
      }
    ]);

    if (selectedMcp) {
      await this.fetchAndDisplayMCP(selectedMcp);
    }
  }

  private async fetchAndDisplayMCP(id: string) {
    const spinner = ora('Fetching MCP details...').start();
    
    try {
      const mcp = await this.apiClient.get(id);
      
      if (!mcp) {
        spinner.fail(`MCP '${id}' not found`);
        await this.pressEnterToContinue();
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
          `${chalk.bold.cyan('Status:')} ${mcp.enabled ? chalk.green('\u2713 Enabled') : chalk.red('\u2717 Disabled')}`,
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
        console.log(`${chalk.bold.cyan('Documentation:')} ${chalk.underline(mcp.documentationUrl)}`);
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

      await this.pressEnterToContinue();
    } catch (error: any) {
      spinner.fail('Failed to fetch MCP');
      this.showError(error.message);
      await this.pressEnterToContinue();
    }
  }

  private async showAdminMenu() {
    const adminNotice = boxen(
      chalk.yellow('Admin functions require authentication.\nThese commands can modify the registry database.'),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: 'round',
        borderColor: 'yellow',
        title: chalk.bold.yellow('\u26a0\ufe0f  Admin Notice'),
        titleAlignment: 'center'
      }
    );
    console.log(adminNotice);

    const { adminAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'adminAction',
        message: chalk.bold('Select admin action:'),
        choices: [
          { name: chalk.yellow('\ud83d\udce5 Import MCP from manifest.json'), value: 'import' },
          { name: chalk.yellow('\u2795 Add new MCP'), value: 'add' },
          { name: chalk.yellow('\u270f\ufe0f  Edit existing MCP'), value: 'edit' },
          { name: chalk.yellow('\ud83d\uddd1\ufe0f  Delete MCP'), value: 'delete' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back to main menu'), value: 'back' }
        ]
      }
    ]);

    switch (adminAction) {
      case 'import':
        await this.importMCP();
        break;
      case 'add':
      case 'edit':
      case 'delete':
        console.log(boxen(
          chalk.yellow('This feature requires direct database access.\nPlease use the web admin interface.'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow'
          }
        ));
        await this.pressEnterToContinue();
        break;
    }
  }

  private async importMCP() {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: 'Enter path to manifest.json file:',
        validate: (input) => input.trim().length > 0 || 'Please enter a file path'
      }
    ]);

    const spinner = ora('Reading manifest...').start();
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const manifestPath = path.resolve(filePath);
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
      console.log(boxen(
        JSON.stringify(mcp, null, 2),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green'
        }
      ));
      
      const { confirmSave } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmSave',
          message: 'Would you like to save this MCP to the registry?',
          default: false
        }
      ]);

      if (confirmSave) {
        const { password } = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter admin password:',
            mask: '*'
          }
        ]);
        
        const saveSpinner = ora('Saving to registry...').start();
        try {
          const result = await this.apiClient.upsertWithAuth(mcp, password);
          saveSpinner.succeed('MCP saved to registry successfully!');
          console.log(boxen(
            chalk.green(`\u2713 ${mcp.name} has been saved to the registry`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green'
            }
          ));
        } catch (error: any) {
          saveSpinner.fail('Failed to save to registry');
          if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            this.showError('Invalid password');
          } else {
            this.showError(error.message);
          }
        }
      }
      
      await this.pressEnterToContinue();
    } catch (error: any) {
      spinner.fail('Failed to read manifest');
      this.showError(error.message);
      await this.pressEnterToContinue();
    }
  }

  private displayMCPTable(mcps: MCPRegistry[]) {
    const tableConfig = {
      border: {
        topBody: chalk.gray('\u2500'),
        topJoin: chalk.gray('\u252c'),
        topLeft: chalk.gray('\u250c'),
        topRight: chalk.gray('\u2510'),
        bottomBody: chalk.gray('\u2500'),
        bottomJoin: chalk.gray('\u2534'),
        bottomLeft: chalk.gray('\u2514'),
        bottomRight: chalk.gray('\u2518'),
        bodyLeft: chalk.gray('\u2502'),
        bodyRight: chalk.gray('\u2502'),
        bodyJoin: chalk.gray('\u2502'),
        joinBody: chalk.gray('\u2500'),
        joinLeft: chalk.gray('\u251c'),
        joinRight: chalk.gray('\u2524'),
        joinJoin: chalk.gray('\u253c')
      },
      columns: [
        { alignment: 'left', width: 20 },
        { alignment: 'left', width: 25 },
        { alignment: 'left', width: 15 },
        { alignment: 'center', width: 10 },
        { alignment: 'center', width: 10 }
      ],
      wordWrap: true
    };
    
    const data = [
      [
        chalk.bold.cyan('ID'),
        chalk.bold.cyan('Name'),
        chalk.bold.cyan('Category'),
        chalk.bold.cyan('Version'),
        chalk.bold.cyan('Status')
      ],
      ...mcps.map(mcp => [
        chalk.white(mcp.id),
        chalk.bold(mcp.name),
        chalk.magenta(mcp.category),
        chalk.dim(mcp.version || '1.0.0'),
        mcp.enabled ? chalk.green('\u2713') : chalk.red('\u2717')
      ])
    ];
    
    console.log(table(data, tableConfig));
  }

  private showError(message: string) {
    const errorBox = boxen(
      chalk.red(message),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red',
        title: chalk.bold.red('\u274c Error'),
        titleAlignment: 'center'
      }
    );
    console.error(errorBox);
  }

  private async pressEnterToContinue() {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: chalk.dim('Press Enter to continue...'),
      }
    ]);
    console.clear();
    console.log(chalk.cyan(figlet.textSync('MCP Registry', { horizontalLayout: 'fitted' })));
    console.log(chalk.gray('\u2501'.repeat(60)));
    console.log();
  }
}