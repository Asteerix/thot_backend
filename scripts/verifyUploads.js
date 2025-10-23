/**
 * Script pour vérifier l'intégrité des fichiers uploadés
 * - Vérifie que les fichiers référencés en DB existent sur le disque
 * - Liste les fichiers orphelins (sur disque mais pas en DB)
 * - Nettoie les références cassées
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function verifyUploads() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // 1. Vérifier les avatars et covers des utilisateurs
    console.log('\n📊 Checking user avatars and covers...');
    await verifyUserImages();

    // 2. Vérifier les images des posts
    console.log('\n📰 Checking post images...');
    await verifyPostImages();

    // 3. Lister les fichiers orphelins
    console.log('\n🗑️  Checking for orphaned files...');
    await findOrphanedFiles();

    console.log('\n✅ Verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function verifyUserImages() {
  const users = await User.find({
    $or: [
      { avatarUrl: { $exists: true, $ne: null, $ne: '' } },
      { coverUrl: { $exists: true, $ne: null, $ne: '' } }
    ]
  });

  console.log(`Found ${users.length} users with images`);

  let missingAvatars = 0;
  let missingCovers = 0;
  let fixedUsers = 0;

  for (const user of users) {
    let needsUpdate = false;

    // Vérifier l'avatar
    if (user.avatarUrl && !user.avatarUrl.startsWith('http')) {
      const avatarPath = path.join(UPLOADS_DIR, user.avatarUrl.replace(/^\/uploads\//, ''));
      if (!fs.existsSync(avatarPath)) {
        console.log(`❌ Missing avatar for user ${user.name} (${user._id}): ${user.avatarUrl}`);
        missingAvatars++;

        // Définir l'avatar par défaut
        const defaultAvatar = user.role === 'journalist'
          ? '/assets/images/defaults/default_journalist_avatar.png'
          : '/assets/images/defaults/default_user_avatar.png';

        user.avatarUrl = defaultAvatar;
        needsUpdate = true;
      }
    }

    // Vérifier la cover
    if (user.coverUrl && !user.coverUrl.startsWith('http')) {
      const coverPath = path.join(UPLOADS_DIR, user.coverUrl.replace(/^\/uploads\//, ''));
      if (!fs.existsSync(coverPath)) {
        console.log(`❌ Missing cover for user ${user.name} (${user._id}): ${user.coverUrl}`);
        missingCovers++;

        // Pas de cover par défaut, mettre à null
        user.coverUrl = null;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await user.save();
      fixedUsers++;
    }
  }

  console.log(`\n📊 User images summary:`);
  console.log(`  - Missing avatars: ${missingAvatars}`);
  console.log(`  - Missing covers: ${missingCovers}`);
  console.log(`  - Fixed users: ${fixedUsers}`);
}

async function verifyPostImages() {
  const posts = await Post.find({
    $or: [
      { imageUrl: { $exists: true, $ne: null, $ne: '' } },
      { videoUrl: { $exists: true, $ne: null, $ne: '' } },
      { thumbnailUrl: { $exists: true, $ne: null, $ne: '' } }
    ]
  });

  console.log(`Found ${posts.length} posts with media`);

  let missingImages = 0;
  let missingVideos = 0;
  let missingThumbnails = 0;
  let fixedPosts = 0;

  for (const post of posts) {
    let needsUpdate = false;

    // Vérifier l'image
    if (post.imageUrl && !post.imageUrl.startsWith('http')) {
      const imagePath = path.join(UPLOADS_DIR, post.imageUrl.replace(/^\/uploads\//, ''));
      if (!fs.existsSync(imagePath)) {
        console.log(`❌ Missing image for post ${post._id}: ${post.imageUrl}`);
        missingImages++;
        post.imageUrl = '/assets/images/defaults/default-post-image.png';
        needsUpdate = true;
      }
    }

    // Vérifier la vidéo
    if (post.videoUrl && !post.videoUrl.startsWith('http')) {
      const videoPath = path.join(UPLOADS_DIR, post.videoUrl.replace(/^\/uploads\//, ''));
      if (!fs.existsSync(videoPath)) {
        console.log(`❌ Missing video for post ${post._id}: ${post.videoUrl}`);
        missingVideos++;
        // Pour les vidéos, on ne peut pas les supprimer si elles sont requises
        // On laisse l'URL cassée et on log seulement
        // Le post devra être supprimé manuellement ou la vidéo re-uploadée
      }
    }

    // Vérifier le thumbnail
    if (post.thumbnailUrl && !post.thumbnailUrl.startsWith('http')) {
      const thumbnailPath = path.join(UPLOADS_DIR, post.thumbnailUrl.replace(/^\/uploads\//, ''));
      if (!fs.existsSync(thumbnailPath)) {
        console.log(`❌ Missing thumbnail for post ${post._id}: ${post.thumbnailUrl}`);
        missingThumbnails++;
        post.thumbnailUrl = '/assets/images/defaults/default-post-image.png';
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await post.save();
      fixedPosts++;
    }
  }

  console.log(`\n📊 Post media summary:`);
  console.log(`  - Missing images: ${missingImages}`);
  console.log(`  - Missing videos: ${missingVideos}`);
  console.log(`  - Missing thumbnails: ${missingThumbnails}`);
  console.log(`  - Fixed posts: ${fixedPosts}`);
}

async function findOrphanedFiles() {
  const uploadedFiles = [];

  // Parcourir tous les fichiers dans uploads/
  function scanDirectory(dir, baseDir = UPLOADS_DIR) {
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

  if (fs.existsSync(UPLOADS_DIR)) {
    scanDirectory(UPLOADS_DIR);
  }

  console.log(`Found ${uploadedFiles.length} files in uploads directory`);

  // Récupérer toutes les URLs de la DB
  const users = await User.find({}, 'avatarUrl coverUrl');
  const posts = await Post.find({}, 'imageUrl videoUrl thumbnailUrl');

  const dbUrls = new Set();

  // Collecter les URLs de la DB
  users.forEach(user => {
    if (user.avatarUrl && !user.avatarUrl.startsWith('http')) {
      dbUrls.add(user.avatarUrl.replace(/^\/uploads/, ''));
    }
    if (user.coverUrl && !user.coverUrl.startsWith('http')) {
      dbUrls.add(user.coverUrl.replace(/^\/uploads/, ''));
    }
  });

  posts.forEach(post => {
    if (post.imageUrl && !post.imageUrl.startsWith('http')) {
      dbUrls.add(post.imageUrl.replace(/^\/uploads/, ''));
    }
    if (post.videoUrl && !post.videoUrl.startsWith('http')) {
      dbUrls.add(post.videoUrl.replace(/^\/uploads/, ''));
    }
    if (post.thumbnailUrl && !post.thumbnailUrl.startsWith('http')) {
      dbUrls.add(post.thumbnailUrl.replace(/^\/uploads/, ''));
    }
  });

  console.log(`Found ${dbUrls.size} file references in database`);

  // Trouver les fichiers orphelins
  const orphanedFiles = uploadedFiles.filter(file => !dbUrls.has(file));

  if (orphanedFiles.length > 0) {
    console.log(`\n⚠️  Found ${orphanedFiles.length} orphaned files:`);
    orphanedFiles.forEach(file => {
      console.log(`  - ${file}`);
    });

    console.log('\n💡 To clean up orphaned files, you can delete them manually or create a cleanup script');
  } else {
    console.log('✅ No orphaned files found');
  }
}

// Run verification
verifyUploads();
