#!/usr/bin/env node

/**
 * Script de nettoyage complet de la base de données et des uploads
 * Supprime toutes les données et fichiers uploadés
 */

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot_journalism';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function deleteDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await deleteDirectory(filePath);
        await fs.rmdir(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }

    return files.length;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

async function cleanUploads() {
  log('\n📁 Nettoyage des uploads...', colors.cyan);

  const uploadDirs = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../public/uploads'),
    path.join(__dirname, '../test-generated-images'),
  ];

  let totalDeleted = 0;

  for (const dir of uploadDirs) {
    try {
      const count = await deleteDirectory(dir);
      if (count > 0) {
        log(`  ✓ Supprimé ${count} fichiers de ${dir}`, colors.green);
        totalDeleted += count;
      }
    } catch (error) {
      log(`  ⚠ Erreur lors du nettoyage de ${dir}: ${error.message}`, colors.yellow);
    }
  }

  log(`  → Total: ${totalDeleted} fichiers supprimés`, colors.bright);
  return totalDeleted;
}

async function dropDatabase() {
  log('\n🗄️  Connexion à MongoDB...', colors.cyan);

  try {
    await mongoose.connect(MONGODB_URI);
    log(`  ✓ Connecté à ${MONGODB_URI}`, colors.green);

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    log(`\n🗑️  Suppression de ${collections.length} collections...`, colors.cyan);

    for (const collection of collections) {
      await db.dropCollection(collection.name);
      log(`  ✓ Collection "${collection.name}" supprimée`, colors.green);
    }

    log(`  → Database complètement nettoyée`, colors.bright);
    return collections.length;
  } catch (error) {
    log(`  ✗ Erreur: ${error.message}`, colors.red);
    throw error;
  }
}

async function cleanLogs() {
  log('\n📋 Nettoyage des logs...', colors.cyan);

  const logsDir = path.join(__dirname, '../logs');

  try {
    const count = await deleteDirectory(logsDir);
    if (count > 0) {
      log(`  ✓ Supprimé ${count} fichiers de logs`, colors.green);
    }
    return count;
  } catch (error) {
    log(`  ⚠ Erreur lors du nettoyage des logs: ${error.message}`, colors.yellow);
    return 0;
  }
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('  🧹 NETTOYAGE COMPLET DU BACKEND', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  log('⚠️  ATTENTION: Cette action est IRRÉVERSIBLE!', colors.yellow);
  log('    - Toutes les données seront supprimées', colors.yellow);
  log('    - Tous les uploads seront supprimés', colors.yellow);
  log('    - Tous les logs seront supprimés\n', colors.yellow);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise((resolve) => {
    readline.question('Êtes-vous sûr de vouloir continuer? (yes/no): ', resolve);
  });

  readline.close();

  if (answer.toLowerCase() !== 'yes') {
    log('\n❌ Opération annulée', colors.red);
    process.exit(0);
  }

  try {
    const startTime = Date.now();

    // Nettoyage des uploads
    const filesDeleted = await cleanUploads();

    // Nettoyage de la base de données
    const collectionsDeleted = await dropDatabase();

    // Nettoyage des logs
    const logsDeleted = await cleanLogs();

    await mongoose.disconnect();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log('\n' + '='.repeat(60), colors.bright);
    log('  ✅ NETTOYAGE TERMINÉ AVEC SUCCÈS', colors.green);
    log('='.repeat(60), colors.bright);
    log(`\n📊 Résumé:`, colors.cyan);
    log(`  • Collections supprimées: ${collectionsDeleted}`, colors.bright);
    log(`  • Fichiers supprimés: ${filesDeleted}`, colors.bright);
    log(`  • Logs supprimés: ${logsDeleted}`, colors.bright);
    log(`  • Durée: ${duration}s\n`, colors.bright);

    process.exit(0);
  } catch (error) {
    log(`\n❌ Erreur fatale: ${error.message}`, colors.red);
    log(error.stack, colors.red);
    process.exit(1);
  }
}

// Gestion du Ctrl+C
process.on('SIGINT', async () => {
  log('\n\n⚠️  Interruption détectée...', colors.yellow);
  try {
    await mongoose.disconnect();
  } catch (error) {
    // Ignore
  }
  log('👋 Au revoir!\n', colors.cyan);
  process.exit(0);
});

main();
