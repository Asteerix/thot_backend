#!/usr/bin/env node

/**
 * Script de validation des variables d'environnement
 * Vérifie que toutes les variables requises sont configurées
 * avant le démarrage du serveur en production
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const log = {
  error: (msg) => console.error(`${colors.red}❌ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.warn(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  title: (msg) => console.log(`${colors.magenta}\n${'='.repeat(60)}\n  ${msg}\n${'='.repeat(60)}${colors.reset}\n`)
};

// Variables requises
const REQUIRED_VARS = {
  'MONGODB_URI': {
    description: 'MongoDB connection URI',
    example: 'mongodb://user:pass@host:port/database',
    validate: (val) => val && (val.startsWith('mongodb://') || val.startsWith('mongodb+srv://'))
  },
  'JWT_SECRET': {
    description: 'Secret key for JWT tokens',
    example: 'your_very_long_and_random_secret_key',
    validate: (val) => val && val.length >= 32
  },
  'PORT': {
    description: 'Server port (should be 8080 for Clever Cloud)',
    example: '8080',
    validate: (val) => val && !isNaN(val) && parseInt(val) > 0,
    default: '8080'
  }
};

// Variables recommandées
const RECOMMENDED_VARS = {
  'NODE_ENV': {
    description: 'Node environment',
    example: 'production',
    validate: (val) => ['production', 'development', 'test'].includes(val),
    default: 'production'
  },
  'CLIENT_URL': {
    description: 'Frontend URL for CORS',
    example: 'https://your-frontend.com',
    validate: (val) => val && (val.startsWith('http://') || val.startsWith('https://'))
  },
  'API_BASE_URL': {
    description: 'Base URL of the API',
    example: 'https://your-api.cleverapps.io',
    validate: (val) => val && (val.startsWith('http://') || val.startsWith('https://'))
  }
};

// Variables optionnelles
const OPTIONAL_VARS = {
  'SENTRY_DSN': {
    description: 'Sentry DSN for error tracking',
    example: 'https://xxx@sentry.io/xxx'
  },
  'AWS_ACCESS_KEY_ID': {
    description: 'AWS access key for S3'
  },
  'AWS_SECRET_ACCESS_KEY': {
    description: 'AWS secret key for S3'
  },
  'AWS_REGION': {
    description: 'AWS region'
  },
  'S3_BUCKET': {
    description: 'S3 bucket name'
  }
};

/**
 * Valide une variable d'environnement
 */
function validateVar(name, config, value, isRequired = true) {
  const hasValue = value !== undefined && value !== null && value !== '';

  if (!hasValue) {
    if (config.default) {
      log.warning(`${name} not set, using default: ${config.default}`);
      return { valid: true, usedDefault: true };
    }
    if (isRequired) {
      log.error(`${name} is required but not set`);
      log.info(`  Description: ${config.description}`);
      if (config.example) {
        log.info(`  Example: ${config.example}`);
      }
      return { valid: false };
    }
    return { valid: true, optional: true };
  }

  if (config.validate && !config.validate(value)) {
    log.error(`${name} has invalid value`);
    log.info(`  Description: ${config.description}`);
    if (config.example) {
      log.info(`  Example: ${config.example}`);
    }
    return { valid: false };
  }

  log.success(`${name} is properly configured`);
  return { valid: true };
}

/**
 * Fonction principale
 */
function main() {
  log.title('Environment Variables Validation');

  let hasErrors = false;
  let hasWarnings = false;

  // Vérifier les variables requises
  console.log(`${colors.blue}📋 Required Variables:${colors.reset}\n`);
  for (const [name, config] of Object.entries(REQUIRED_VARS)) {
    const result = validateVar(name, config, process.env[name], true);
    if (!result.valid) {
      hasErrors = true;
    }
  }

  // Vérifier les variables recommandées
  console.log(`\n${colors.blue}📋 Recommended Variables:${colors.reset}\n`);
  for (const [name, config] of Object.entries(RECOMMENDED_VARS)) {
    const result = validateVar(name, config, process.env[name], false);
    if (!result.valid) {
      hasWarnings = true;
    }
  }

  // Vérifier les variables optionnelles
  console.log(`\n${colors.blue}📋 Optional Variables:${colors.reset}\n`);
  let optionalCount = 0;
  for (const [name, config] of Object.entries(OPTIONAL_VARS)) {
    if (process.env[name]) {
      log.success(`${name} is configured`);
      optionalCount++;
    } else {
      log.info(`${name} not configured (optional)`);
    }
  }

  // Résumé
  log.title('Validation Summary');

  const requiredCount = Object.keys(REQUIRED_VARS).length;
  const recommendedCount = Object.keys(RECOMMENDED_VARS).length;

  console.log(`Required variables:    ${hasErrors ? colors.red : colors.green}${requiredCount} checked${colors.reset}`);
  console.log(`Recommended variables: ${hasWarnings ? colors.yellow : colors.green}${recommendedCount} checked${colors.reset}`);
  console.log(`Optional variables:    ${colors.blue}${optionalCount} configured${colors.reset}\n`);

  if (hasErrors) {
    log.error('Validation FAILED - Required variables are missing or invalid');
    console.log('\n💡 To configure environment variables on Clever Cloud:\n');
    console.log('   Via Console:');
    console.log('   1. Go to https://console.clever-cloud.com');
    console.log('   2. Select your application');
    console.log('   3. Go to "Environment variables"');
    console.log('   4. Add the missing variables\n');
    console.log('   Via CLI:');
    console.log('   clever env set VARIABLE_NAME "value"\n');
    process.exit(1);
  }

  if (hasWarnings) {
    log.warning('Validation passed with warnings - Some recommended variables are missing');
    console.log('\n💡 Consider setting recommended variables for better functionality\n');
    process.exit(0);
  }

  log.success('All validations passed! 🎉');
  console.log('\n✨ Your environment is properly configured for deployment\n');
  process.exit(0);
}

// Exécuter si appelé directement
if (require.main === module) {
  main();
}

module.exports = { validateVar, REQUIRED_VARS, RECOMMENDED_VARS, OPTIONAL_VARS };
