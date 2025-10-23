#!/usr/bin/env node

/**
 * Script de régénération complète de la base de données
 * Supprime et recrée la base avec les indexes nécessaires
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot_journalism';

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

// Schémas de base pour créer les collections avec validation
const schemas = {
  users: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['username', 'email', 'password', 'type'],
        properties: {
          username: { bsonType: 'string', minLength: 3, maxLength: 30 },
          email: { bsonType: 'string', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
          password: { bsonType: 'string' },
          type: { enum: ['reader', 'journalist'] },
          role: { enum: ['user', 'admin', 'moderator'] },
          isVerified: { bsonType: 'bool' },
          isBanned: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        }
      }
    }
  },

  posts: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['title', 'type', 'journalist', 'domain'],
        properties: {
          title: { bsonType: 'string', minLength: 1, maxLength: 200 },
          type: { enum: ['article', 'video', 'podcast', 'short'] },
          content: { bsonType: 'string' },
          journalist: { bsonType: 'objectId' },
          domain: { enum: ['politics', 'economy', 'technology', 'culture', 'sports', 'science', 'other'] },
          status: { enum: ['draft', 'published', 'archived'] },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        }
      }
    }
  },

  comments: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['content', 'author', 'postId'],
        properties: {
          content: { bsonType: 'string', minLength: 1 },
          author: { bsonType: 'objectId' },
          postId: { bsonType: 'objectId' },
          parentId: { bsonType: ['objectId', 'null'] },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        }
      }
    }
  },

  notifications: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['recipient', 'type', 'message'],
        properties: {
          recipient: { bsonType: 'objectId' },
          sender: { bsonType: 'objectId' },
          type: { enum: ['post_like', 'comment_like', 'comment_reply', 'new_follower', 'mention', 'post_removed'] },
          message: { bsonType: 'string' },
          read: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
        }
      }
    }
  },

  reports: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['reporter', 'targetType', 'reason'],
        properties: {
          reporter: { bsonType: 'objectId' },
          targetType: { enum: ['post', 'comment', 'user'] },
          targetId: { bsonType: 'objectId' },
          reason: { enum: ['spam', 'harassment', 'hate_speech', 'violence', 'false_information', 'inappropriate_content', 'copyright', 'other'] },
          status: { enum: ['pending', 'reviewed', 'resolved', 'dismissed'] },
          createdAt: { bsonType: 'date' },
        }
      }
    }
  },
};

// Index à créer pour chaque collection
const indexes = {
  users: [
    { key: { email: 1 }, unique: true },
    { key: { username: 1 }, unique: true },
    { key: { type: 1 } },
    { key: { createdAt: -1 } },
  ],

  posts: [
    { key: { journalist: 1 } },
    { key: { domain: 1 } },
    { key: { type: 1 } },
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    { key: { 'stats.likes': -1 } },
    { key: { title: 'text', content: 'text' } },
  ],

  comments: [
    { key: { postId: 1, createdAt: -1 } },
    { key: { author: 1 } },
    { key: { parentId: 1 } },
  ],

  notifications: [
    { key: { recipient: 1, read: 1, createdAt: -1 } },
    { key: { createdAt: -1 } },
  ],

  reports: [
    { key: { status: 1, createdAt: -1 } },
    { key: { targetType: 1, targetId: 1 } },
    { key: { reporter: 1 } },
  ],
};

async function dropAllDatabases() {
  log('\n🗑️  Suppression complète des bases de données...', colors.cyan);

  const dbs = ['thot_journalism', 'thot'];

  for (const dbName of dbs) {
    try {
      const conn = await mongoose.createConnection(`mongodb://localhost:27017/${dbName}`).asPromise();
      await conn.dropDatabase();
      await conn.close();
      log(`  ✓ Base "${dbName}" supprimée`, colors.green);
    } catch (error) {
      if (error.code !== 26) { // Database doesn't exist
        log(`  ⚠ Erreur sur "${dbName}": ${error.message}`, colors.yellow);
      }
    }
  }
}

async function createCollections(db) {
  log('\n📦 Création des collections avec validation...', colors.cyan);

  for (const [collectionName, schema] of Object.entries(schemas)) {
    try {
      await db.createCollection(collectionName, schema);
      log(`  ✓ Collection "${collectionName}" créée`, colors.green);
    } catch (error) {
      log(`  ⚠ Erreur sur "${collectionName}": ${error.message}`, colors.yellow);
    }
  }
}

async function createIndexes(db) {
  log('\n🔍 Création des index...', colors.cyan);

  for (const [collectionName, indexList] of Object.entries(indexes)) {
    const collection = db.collection(collectionName);

    for (const index of indexList) {
      try {
        await collection.createIndex(index.key, {
          unique: index.unique || false,
          background: true
        });
        const indexName = Object.keys(index.key).join('_');
        log(`  ✓ Index "${indexName}" créé sur "${collectionName}"`, colors.green);
      } catch (error) {
        log(`  ⚠ Erreur d'index sur "${collectionName}": ${error.message}`, colors.yellow);
      }
    }
  }
}

async function verifyDatabase(db) {
  log('\n✅ Vérification de la base de données...', colors.cyan);

  const collections = await db.listCollections().toArray();
  log(`  • Collections: ${collections.length}`, colors.bright);

  for (const collection of collections) {
    const count = await db.collection(collection.name).countDocuments();
    const indexInfo = await db.collection(collection.name).indexes();
    log(`    - ${collection.name}: ${count} documents, ${indexInfo.length} index`, colors.bright);
  }
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('  🔄 RÉGÉNÉRATION COMPLÈTE DE LA BASE DE DONNÉES', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  try {
    const startTime = Date.now();

    // Supprimer toutes les bases
    await dropAllDatabases();

    // Se connecter à la nouvelle base
    log('\n🔌 Connexion à MongoDB...', colors.cyan);
    await mongoose.connect(MONGODB_URI);
    log(`  ✓ Connecté à ${MONGODB_URI}`, colors.green);

    const db = mongoose.connection.db;

    // Créer collections avec validation
    await createCollections(db);

    // Créer les index
    await createIndexes(db);

    // Vérifier
    await verifyDatabase(db);

    await mongoose.disconnect();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log('\n' + '='.repeat(60), colors.bright);
    log('  ✅ RÉGÉNÉRATION TERMINÉE AVEC SUCCÈS', colors.green);
    log('='.repeat(60), colors.bright);
    log(`\n⏱️  Durée totale: ${duration}s\n`, colors.bright);

    process.exit(0);
  } catch (error) {
    log(`\n❌ Erreur fatale: ${error.message}`, colors.red);
    log(error.stack, colors.red);
    process.exit(1);
  }
}

main();
