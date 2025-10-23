/**
 * Script pour supprimer les fichiers orphelins
 * (fichiers qui existent sur le disque mais ne sont pas référencés en DB)
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function cleanOrphanedFiles() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    const orphanedFiles = await findOrphanedFiles();

    if (orphanedFiles.length === 0) {
      console.log('✅ No orphaned files found!');
      process.exit(0);
    }

    console.log(`\n⚠️  Found ${orphanedFiles.length} orphaned files:\n`);
    orphanedFiles.forEach(file => {
      const fullPath = path.join(UPLOADS_DIR, file);
      const stats = fs.statSync(fullPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  - ${file} (${sizeMB} MB)`);
    });

    // Calculer l'espace total
    const totalSize = orphanedFiles.reduce((acc, file) => {
      const fullPath = path.join(UPLOADS_DIR, file);
      const stats = fs.statSync(fullPath);
      return acc + stats.size;
    }, 0);
    const totalMB = (totalSize / 1024 / 1024).toFixed(2);

    console.log(`\n📊 Total size: ${totalMB} MB`);

    // Demander confirmation (en mode non-interactif, on skip)
    const shouldDelete = process.argv.includes('--confirm');

    if (!shouldDelete) {
      console.log('\n💡 To delete these files, run:');
      console.log('   node scripts/cleanOrphanedFiles.js --confirm\n');
      process.exit(0);
    }

    // Supprimer les fichiers
    console.log('\n🗑️  Deleting orphaned files...\n');
    let deletedCount = 0;
    let errorCount = 0;

    for (const file of orphanedFiles) {
      const fullPath = path.join(UPLOADS_DIR, file);
      try {
        fs.unlinkSync(fullPath);
        console.log(`  ✅ Deleted: ${file}`);
        deletedCount++;
      } catch (err) {
        console.error(`  ❌ Error deleting ${file}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  - Deleted: ${deletedCount} files`);
    console.log(`  - Errors: ${errorCount} files`);
    console.log(`  - Space freed: ${totalMB} MB\n`);

    console.log('✅ Cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function findOrphanedFiles() {
  const uploadedFiles = [];

  // Parcourir tous les fichiers dans uploads/
  function scanDirectory(dir, baseDir = UPLOADS_DIR) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath, baseDir);
      } else {
        const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/');
        uploadedFiles.push(relativePath);
      }
    }
  }

  scanDirectory(UPLOADS_DIR);

  console.log(`📁 Found ${uploadedFiles.length} files in uploads directory`);

  // Récupérer toutes les URLs de la DB
  const users = await User.find({}, 'avatarUrl coverUrl');
  const posts = await Post.find({}, 'imageUrl videoUrl thumbnailUrl');

  const dbUrls = new Set();

  // Collecter les URLs de la DB
  users.forEach(user => {
    if (user.avatarUrl && !user.avatarUrl.startsWith('http') && !user.avatarUrl.startsWith('/assets')) {
      dbUrls.add(user.avatarUrl.replace(/^\/uploads/, ''));
    }
    if (user.coverUrl && !user.coverUrl.startsWith('http') && !user.coverUrl.startsWith('/assets')) {
      dbUrls.add(user.coverUrl.replace(/^\/uploads/, ''));
    }
  });

  posts.forEach(post => {
    if (post.imageUrl && !post.imageUrl.startsWith('http') && !post.imageUrl.startsWith('/assets')) {
      dbUrls.add(post.imageUrl.replace(/^\/uploads/, ''));
    }
    if (post.videoUrl && !post.videoUrl.startsWith('http')) {
      dbUrls.add(post.videoUrl.replace(/^\/uploads/, ''));
    }
    if (post.thumbnailUrl && !post.thumbnailUrl.startsWith('http') && !post.thumbnailUrl.startsWith('/assets')) {
      dbUrls.add(post.thumbnailUrl.replace(/^\/uploads/, ''));
    }
  });

  console.log(`📊 Found ${dbUrls.size} file references in database`);

  // Trouver les fichiers orphelins
  return uploadedFiles.filter(file => !dbUrls.has(file));
}

// Run cleanup
cleanOrphanedFiles();
