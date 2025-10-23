/* eslint-disable */
/**
 * Script de migration : User.interactions.savedPosts → User.interactions.bookmarks
 *
 * Ce script migre les données du champ `interactions.savedPosts` vers `interactions.bookmarks`
 * pour tous les utilisateurs.
 *
 * Usage: node scripts/migrateUserSavedPostsToBookmarks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot';

async function migrateUserSavedPostsToBookmarks() {
  console.log('🚀 Starting migration: User.interactions.savedPosts → bookmarks\n');

  try {
    // Connexion à MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Trouver tous les users avec savedPosts non vide
    console.log('🔍 Finding users with savedPosts data...');
    const usersWithSavedPosts = await User.find({
      'interactions.savedPosts': { $exists: true, $ne: [] }
    });

    console.log(`📊 Found ${usersWithSavedPosts.length} users with savedPosts data\n`);

    if (usersWithSavedPosts.length === 0) {
      console.log('✨ No users to migrate. Database is already up to date!');
      await mongoose.disconnect();
      return;
    }

    // Statistiques
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Migrer chaque utilisateur
    for (const user of usersWithSavedPosts) {
      try {
        console.log(`  Processing user: ${user._id} (${user.email})`);

        const savedPostIds = user.interactions?.savedPosts || [];

        // Initialiser bookmarks s'il n'existe pas
        if (!user.interactions.bookmarks) {
          user.interactions.bookmarks = [];
        }

        // Vérifier si déjà migré (bookmarks contient déjà des données)
        if (user.interactions.bookmarks.length > 0 && savedPostIds.length === 0) {
          console.log(`  ⏭️  Already migrated, skipping...`);
          skipped++;
          continue;
        }

        // Si bookmarks est vide mais savedPosts a des données, migrer
        if (user.interactions.bookmarks.length === 0 && savedPostIds.length > 0) {
          user.interactions.bookmarks = [...savedPostIds];
          console.log(`  ✅ Migrated ${savedPostIds.length} bookmarks`);
          migrated++;
        }
        // Si les deux ont des données, fusionner sans doublons
        else if (user.interactions.bookmarks.length > 0 && savedPostIds.length > 0) {
          const bookmarksSet = new Set(user.interactions.bookmarks.map(id => id.toString()));
          let added = 0;

          for (const postId of savedPostIds) {
            if (!bookmarksSet.has(postId.toString())) {
              user.interactions.bookmarks.push(postId);
              added++;
            }
          }

          if (added > 0) {
            console.log(`  ✅ Added ${added} missing bookmarks (merged)`);
            migrated++;
          } else {
            console.log(`  ⏭️  All bookmarks already present, skipping...`);
            skipped++;
          }
        }

        // Garder savedPosts pour rétrocompatibilité (il sera synchronisé par le code)
        // user.interactions.savedPosts = [...user.interactions.bookmarks];

        // Sauvegarder
        await user.save();

      } catch (error) {
        console.error(`  ❌ Error migrating user ${user._id}:`, error.message);
        errors++;
      }
    }

    // Résumé
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${migrated} users`);
    console.log(`⏭️  Skipped (already migrated): ${skipped} users`);
    console.log(`❌ Errors: ${errors} users`);
    console.log(`📊 Total processed: ${usersWithSavedPosts.length} users`);
    console.log('='.repeat(60) + '\n');

    // Vérification finale
    console.log('🔍 Running final verification...');
    const usersWithBookmarks = await User.countDocuments({
      'interactions.bookmarks': { $exists: true, $ne: [] }
    });

    console.log(`✨ Total users with bookmarks: ${usersWithBookmarks}`);
    console.log('✨ ✨ ✨ Migration completed successfully! ✨ ✨ ✨\n');

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
  migrateUserSavedPostsToBookmarks()
    .then(() => {
      console.log('🎉 Migration script finished!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script crashed:', error);
      process.exit(1);
    });
}

module.exports = migrateUserSavedPostsToBookmarks;
