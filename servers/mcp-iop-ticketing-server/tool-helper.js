import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ToolHelper {
  constructor() {
    this.categories = null;
    this.loadCategories();
  }

  loadCategories() {
    try {
      const categoriesPath = path.join(__dirname, 'tool-categories.json');
      const data = fs.readFileSync(categoriesPath, 'utf8');
      this.categories = JSON.parse(data);
    } catch (error) {
      console.error('Error loading tool categories:', error);
      this.categories = { categories: {}, quickAccess: {} };
    }
  }

  getToolsByCategory(categoryName) {
    if (!this.categories.categories[categoryName]) {
      console.log(`Category '${categoryName}' not found.`);
      return [];
    }
    return this.categories.categories[categoryName].tools;
  }

  getAllCategories() {
    return Object.keys(this.categories.categories).map(key => ({
      id: key,
      ...this.categories.categories[key]
    }));
  }

  getCategoryInfo(categoryName) {
    return this.categories.categories[categoryName] || null;
  }

  getQuickAccessTools(type) {
    if (!this.categories.quickAccess[type]) {
      console.log(`Quick access type '${type}' not found.`);
      return [];
    }
    return this.categories.quickAccess[type].tools;
  }

  findToolCategory(toolName) {
    for (const [categoryId, category] of Object.entries(this.categories.categories)) {
      if (category.tools.includes(toolName)) {
        return {
          id: categoryId,
          ...category
        };
      }
    }
    return null;
  }

  searchTools(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const [categoryId, category] of Object.entries(this.categories.categories)) {
      const matchingTools = category.tools.filter(tool => 
        tool.toLowerCase().includes(lowerQuery)
      );
      
      if (matchingTools.length > 0) {
        results.push({
          category: {
            id: categoryId,
            ...category
          },
          tools: matchingTools
        });
      }
    }
    
    return results;
  }

  printCategorySummary() {
    console.log('\n📊 IOP Ticketing MCP Tool Categories Summary\n');
    console.log('=' .repeat(60));
    
    for (const [categoryId, category] of Object.entries(this.categories.categories)) {
      console.log(`\n${category.icon} ${category.name}`);
      console.log(`   ${category.description}`);
      console.log(`   Tools: ${category.tools.length}`);
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log(`\nTotal Categories: ${Object.keys(this.categories.categories).length}`);
    console.log(`Total Tools: ${Object.values(this.categories.categories).reduce((sum, cat) => sum + cat.tools.length, 0)}`);
  }

  getUsageExamples() {
    return {
      articles: {
        search: "_api_v1_articles?SearchText=prodotto&Skip=0&Take=10",
        getById: "_api_v1_articles_id__id_?id=12345",
        count: "_api_v1_articles_count?Active=true"
      },
      customers: {
        search: "_api_v1_customers?SearchText=mario&Skip=0&Take=10",
        getById: "_api_v1_customers_id__id_?id=67890",
        withContacts: "_api_v1_customers_id__id__contacts?id=67890"
      },
      orders: {
        recent: "_api_v1_orders?From=2024-01-01&State=open",
        getById: "_api_v1_orders_id__id_?id=ORD-2024-001"
      }
    };
  }
}

export default ToolHelper;

// Example usage when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const helper = new ToolHelper();
  
  // Print summary
  helper.printCategorySummary();
  
  // Show quick access tools
  console.log('\n\n🚀 Quick Access Tools:');
  console.log('\nSearch Tools:', helper.getQuickAccessTools('search'));
  console.log('\nCount Tools:', helper.getQuickAccessTools('counts'));
  
  // Search example
  console.log('\n\n🔍 Searching for "customer" tools:');
  const searchResults = helper.searchTools('customer');
  searchResults.forEach(result => {
    console.log(`\nCategory: ${result.category.name}`);
    console.log('Matching tools:', result.tools);
  });
}