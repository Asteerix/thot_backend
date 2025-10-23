const cacheService = require('../src/services/cache.service');

console.log('Clearing all caches...');
cacheService.clearCache();
console.log('Cache cleared successfully!');
process.exit(0);
