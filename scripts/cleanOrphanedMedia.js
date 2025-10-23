#!/usr/bin/env node

/**
 * Script pour nettoyer les références de médias manquants dans la base de données
 *
 * Ce script:
 * 1. Scanne tous les posts, questions, shorts et users dans la DB
 * 2. Vérifie si les fichiers uploadés existent sur le disque
 * 3. Propose 2 modes:
 *    - DRY RUN (par défaut): Liste les fichiers manquants sans rien modifier
 *    - CLEAN: Nettoie les références manquantes (met à null ou supprime selon le cas)
 *
 * Usage:
 *   node scripts/cleanOrphanedMedia.js          # Dry run (liste les problèmes)
 *   node scripts/cleanOrphanedMedia.js --clean  # Nettoie réellement la DB
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');

const Post = require('../src/models/post.model');
const User = require('../src/models/user.model');

const UPLOADS_DIR = path.join(__dirname, '../public/uploads');
const isDryRun = !process.argv.includes('--clean');

// Statistiques
const stats = {
  posts: { checked: 0, missingMedia: 0, cleaned: 0 },
  users: { checked: 0, missingAvatar: 0, missingCover: 0, cleaned: 0 },
  totalFiles: { missing: [] }
};

/**
 * Vérifie si un fichier existe sur le disque
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extrait le chemin relatif d'une URL d'upload
 */
function extractUploadPath(url) {
  if (!url || typeof url !== 'string') return null;

  // Patterns possibles:
  // - /uploads/profile/file.jpg
  // - http://localhost:3000/uploads/profile/file.jpg
  // - uploads/profile/file.jpg
  const match = url.match(/(?:\/|^)uploads\/(.+)/);
  return match ? match[1] : null;
}

/**
 * Vérifie et nettoie les posts avec médias manquants
 */
async function cleanPosts() {
  console.log('\n📝 Vérification des posts...');

  const posts = await Post.find({
    isDeleted: { $ne: true }
  }).select('_id title type imageUrl videoUrl thumbnailUrl metadata.article.imageUrl metadata.question.imageUrl');

  for (const post of posts) {
    stats.posts.checked++;
    let needsUpdate = false;
    let shouldDelete = false;
    const missingFiles = [];

    // Vérifier imageUrl
    if (post.imageUrl) {
      const relativePath = extractUploadPath(post.imageUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          missingFiles.push({ field: 'imageUrl', url: post.imageUrl, path: fullPath });

          // Stratégie selon le type de post:
          // - article sans image: on marque comme deleted (peut pas afficher sans image)
          // - question sans image: on marque comme deleted (l'image fait partie de la question)
          // - video/short: l'image n'est pas critique, on met null
          if (post.type === 'article' || post.type === 'question') {
            shouldDelete = true;
          } else {
            post.imageUrl = undefined;
            needsUpdate = true;
          }
        }
      }
    }

    // Vérifier videoUrl (critique pour video/short)
    if (post.videoUrl) {
      const relativePath = extractUploadPath(post.videoUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          missingFiles.push({ field: 'videoUrl', url: post.videoUrl, path: fullPath });
          // Video sans vidéo = inutile, on supprime
          if (post.type === 'video' || post.type === 'short') {
            shouldDelete = true;
          }
        }
      }
    }

    // Vérifier thumbnailUrl (requis pour vidéos)
    if (post.thumbnailUrl) {
      const relativePath = extractUploadPath(post.thumbnailUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          missingFiles.push({ field: 'thumbnailUrl', url: post.thumbnailUrl, path: fullPath });
          // Thumbnail requis pour vidéos/shorts
          if (post.type === 'video' || post.type === 'short') {
            shouldDelete = true;
          } else {
            post.thumbnailUrl = null;
            needsUpdate = true;
          }
        }
      }
    }

    // Vérifier metadata article image
    if (post.metadata?.article?.imageUrl) {
      const relativePath = extractUploadPath(post.metadata.article.imageUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          missingFiles.push({ field: 'metadata.article.imageUrl', url: post.metadata.article.imageUrl, path: fullPath });
          shouldDelete = true; // Article sans image = pas affichable
        }
      }
    }

    // Vérifier metadata question image
    if (post.metadata?.question?.imageUrl) {
      const relativePath = extractUploadPath(post.metadata.question.imageUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          missingFiles.push({ field: 'metadata.question.imageUrl', url: post.metadata.question.imageUrl, path: fullPath });
          shouldDelete = true; // Question sans image = fait partie de la question
        }
      }
    }

    if (shouldDelete || needsUpdate) {
      stats.posts.missingMedia++;
      console.log(`\n❌ Post: ${post.title || post._id} (${post.type})`);
      missingFiles.forEach(({ field, url }) => {
        console.log(`   └─ ${field}: ${url}`);
        stats.totalFiles.missing.push(url);
      });

      if (!isDryRun) {
        if (shouldDelete) {
          // Soft delete
          post.isDeleted = true;
          post.deletedAt = new Date();
          await post.save();
          console.log('   🗑️  Marqué comme supprimé (média critique manquant)');
        } else if (needsUpdate) {
          await post.save();
          console.log('   ✅ Nettoyé (médias non-critiques)');
        }
        stats.posts.cleaned++;
      } else {
        if (shouldDelete) {
          console.log('   ⚠️  Sera marqué comme supprimé');
        } else {
          console.log('   💡 Sera nettoyé');
        }
      }
    }
  }

  console.log(`\n✓ Posts vérifiés: ${stats.posts.checked}`);
  console.log(`✓ Posts avec médias manquants: ${stats.posts.missingMedia}`);
  if (!isDryRun) {
    console.log(`✓ Posts nettoyés: ${stats.posts.cleaned}`);
  }
}

/**
 * Vérifie et nettoie les users avec avatars/covers manquants
 */
async function cleanUsers() {
  console.log('\n👤 Vérification des utilisateurs...');

  const users = await User.find({
    status: { $ne: 'deleted' }
  }).select('_id name username email avatarUrl coverUrl');

  for (const user of users) {
    stats.users.checked++;
    let needsUpdate = false;

    // Vérifier avatarUrl (sauf les chemins par défaut)
    if (user.avatarUrl && !user.avatarUrl.includes('/assets/images/defaults/')) {
      const relativePath = extractUploadPath(user.avatarUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          console.log(`\n❌ User: ${user.name || user.username || user._id}`);
          console.log(`   └─ avatarUrl: ${user.avatarUrl}`);
          stats.users.missingAvatar++;
          stats.totalFiles.missing.push(user.avatarUrl);
          user.avatarUrl = ''; // Sera remplacé par défaut côté API
          needsUpdate = true;
        }
      }
    }

    // Vérifier coverUrl
    if (user.coverUrl) {
      const relativePath = extractUploadPath(user.coverUrl);
      if (relativePath) {
        const fullPath = path.join(UPLOADS_DIR, relativePath);
        if (!await fileExists(fullPath)) {
          console.log(`\n❌ User: ${user.name || user.username || user._id}`);
          console.log(`   └─ coverUrl: ${user.coverUrl}`);
          stats.users.missingCover++;
          stats.totalFiles.missing.push(user.coverUrl);
          user.coverUrl = null;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      if (!isDryRun) {
        // Update direct pour éviter les problèmes de validation
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              avatarUrl: user.avatarUrl,
              coverUrl: user.coverUrl
            }
          }
        );
        stats.users.cleaned++;
        console.log('   ✅ Nettoyé');
      }
    }
  }

  console.log(`\n✓ Users vérifiés: ${stats.users.checked}`);
  console.log(`✓ Users avec avatar manquant: ${stats.users.missingAvatar}`);
  console.log(`✓ Users avec cover manquant: ${stats.users.missingCover}`);
  if (!isDryRun) {
    console.log(`✓ Users nettoyés: ${stats.users.cleaned}`);
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🔍 Nettoyage des médias orphelins\n');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (simulation)' : '🧹 CLEAN (modifications réelles)'}`);
  console.log(`Dossier uploads: ${UPLOADS_DIR}\n`);

  try {
    // Connexion à MongoDB
    console.log('📡 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Connecté à MongoDB\n');

    // Nettoyage
    await cleanPosts();
    await cleanUsers();

    // Résumé final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ FINAL');
    console.log('='.repeat(60));
    console.log(`\nTotal fichiers manquants: ${stats.totalFiles.missing.length}`);
    console.log(`Posts affectés: ${stats.posts.missingMedia}`);
    console.log(`Users affectés: ${stats.users.missingAvatar + stats.users.missingCover}`);

    if (isDryRun) {
      console.log('\n⚠️  Mode DRY RUN - Aucune modification effectuée');
      console.log('💡 Pour nettoyer réellement, exécutez: node scripts/cleanOrphanedMedia.js --clean');
    } else {
      console.log(`\n✅ Nettoyage terminé!`);
      console.log(`   - ${stats.posts.cleaned} posts nettoyés`);
      console.log(`   - ${stats.users.cleaned} users nettoyés`);
    }

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Déconnecté de MongoDB\n');
  }
}

// Exécution
main().catch(console.error);
