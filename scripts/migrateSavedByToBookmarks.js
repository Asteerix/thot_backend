/* eslint-disable */
/**
 * Script de migration : savedBy → interactions.bookmarks
 *
 * Ce script migre les données du champ obsolète `savedBy` vers la nouvelle structure
 * `interactions.bookmarks` pour tous les posts, questions et shorts.
 *
 * Usage: node scripts/migrateSavedByToBookmarks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../src/models/post.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot';

async function migrateSavedByToBookmarks() {
  console.log('🚀 Starting migration: savedBy → interactions.bookmarks\n');

  try {
    // Connexion à MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Trouver tous les posts avec un champ savedBy non vide
    console.log('🔍 Finding posts with savedBy data...');
    const postsWithSavedBy = await Post.find({
      savedBy: { $exists: true, $ne: [] }
    });

    console.log(`📊 Found ${postsWithSavedBy.length} posts with savedBy data\n`);

    if (postsWithSavedBy.length === 0) {
      console.log('✨ No posts to migrate. Database is already up to date!');
      await mongoose.disconnect();
      return;
    }

    // Statistiques
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Migrer chaque post
    for (const post of postsWithSavedBy) {
      try {
        console.log(`  Processing post: ${post._id} (${post.type})`);

        // Vérifier si déjà migré
        if (post.interactions?.bookmarks?.users?.length > 0) {
          console.log(`  ⏭️  Already migrated, skipping...`);
          skipped++;

          // Supprimer savedBy quand même
          post.savedBy = undefined;
          await post.save();
          continue;
        }

        // Initialiser la structure si nécessaire
        if (!post.interactions) {
          post.interactions = {};
        }
        if (!post.interactions.likes) {
          post.interactions.likes = { users: [], count: 0 };
        }
        if (!post.interactions.dislikes) {
          post.interactions.dislikes = { users: [], count: 0 };
        }
        if (!post.interactions.comments) {
          post.interactions.comments = { users: [], count: 0 };
        }
        if (!post.interactions.reports) {
          post.interactions.reports = { users: [], count: 0 };
        }

        // Migrer savedBy vers bookmarks
        const savedByUsers = Array.isArray(post.savedBy) ? post.savedBy : [];

        post.interactions.bookmarks = {
          users: savedByUsers.map(userId => ({
            user: userId,
            createdAt: new Date() // Date de migration comme createdAt
          })),
          count: savedByUsers.length
        };

        // Supprimer l'ancien champ
        post.savedBy = undefined;

        // Sauvegarder
        await post.save();

        console.log(`  ✅ Migrated ${savedByUsers.length} bookmarks`);
        migrated++;

      } catch (error) {
        console.error(`  ❌ Error migrating post ${post._id}:`, error.message);
        errors++;
      }
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${migrated} posts`);
    console.log(`⏭️  Skipped (already migrated): ${skipped} posts`);
    console.log(`❌ Errors: ${errors} posts`);
    console.log(`📊 Total processed: ${postsWithSavedBy.length} posts`);
    console.log('='.repeat(60) + '\n');

    // Vérification finale
    console.log('🔍 Running final verification...');
    const remainingSavedBy = await Post.countDocuments({
      savedBy: { $exists: true, $ne: [] }
    });

    if (remainingSavedBy === 0) {
      console.log('✨ ✨ ✨ Migration completed successfully! ✨ ✨ ✨');
      console.log('All savedBy fields have been migrated to interactions.bookmarks\n');
    } else {
      console.log(`⚠️  Warning: ${remainingSavedBy} posts still have savedBy data`);
      console.log('You may need to run the migration again.\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Déconnexion
    console.log('👋 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Disconnected\n');
  }
}

// Exécuter la migration
if (require.main === module) {
  migrateSavedByToBookmarks()
    .then(() => {
      console.log('🎉 Migration script finished!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script crashed:', error);
      process.exit(1);
    });
}

module.exports = migrateSavedByToBookmarks;