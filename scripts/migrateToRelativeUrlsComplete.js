/**
 * Script pour migrer TOUTES les URLs absolues vers des URLs relatives
 * Gère tous les cas : localhost, ngrok, VPS, etc.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');

async function migrateUrls() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Patterns à remplacer
    const urlPatterns = [
      'https://api.thot.com',
      'http://localhost:3000',
      'http://localhost:5000',
      /https:\/\/[a-z0-9-]+\.ngrok-free\.app/,
      /https:\/\/[a-z0-9-]+\.ngrok\.io/,
      /https:\/\/[0-9a-f-]+\.ngrok-free\.app/
    ];

    console.log('\n📊 Migrating user URLs...');
    await migrateUserUrls(urlPatterns);

    console.log('\n📰 Migrating post URLs...');
    await migratePostUrls(urlPatterns);

    console.log('\n✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function migrateUserUrls(urlPatterns) {
  const users = await User.find({
    $or: [
      { avatarUrl: { $regex: /^https?:\/\// } },
      { coverUrl: { $regex: /^https?:\/\// } }
    ]
  });

  console.log(`Found ${users.length} users with absolute URLs`);

  let updatedAvatars = 0;
  let updatedCovers = 0;

  for (const user of users) {
    let needsUpdate = false;

    // Nettoyer l'avatar
    if (user.avatarUrl && user.avatarUrl.startsWith('http')) {
      const originalUrl = user.avatarUrl;
      user.avatarUrl = convertToRelativeUrl(user.avatarUrl, urlPatterns);

      if (user.avatarUrl !== originalUrl) {
        console.log(`✅ User ${user.name}: ${originalUrl} → ${user.avatarUrl}`);
        updatedAvatars++;
        needsUpdate = true;
      }
    }

    // Nettoyer la cover
    if (user.coverUrl && user.coverUrl.startsWith('http')) {
      const originalUrl = user.coverUrl;
      user.coverUrl = convertToRelativeUrl(user.coverUrl, urlPatterns);

      if (user.coverUrl !== originalUrl) {
        console.log(`✅ User ${user.name}: ${originalUrl} → ${user.coverUrl}`);
        updatedCovers++;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await user.save();
    }
  }

  console.log(`\n📊 User URLs summary:`);
  console.log(`  - Updated avatars: ${updatedAvatars}`);
  console.log(`  - Updated covers: ${updatedCovers}`);
}

async function migratePostUrls(urlPatterns) {
  const posts = await Post.find({
    $or: [
      { imageUrl: { $regex: /^https?:\/\// } },
      { videoUrl: { $regex: /^https?:\/\// } },
      { thumbnailUrl: { $regex: /^https?:\/\// } }
    ]
  });

  console.log(`Found ${posts.length} posts with absolute URLs`);

  let updatedImages = 0;
  let updatedVideos = 0;
  let updatedThumbnails = 0;

  for (const post of posts) {
    let needsUpdate = false;

    // Nettoyer l'image
    if (post.imageUrl && post.imageUrl.startsWith('http')) {
      const originalUrl = post.imageUrl;
      post.imageUrl = convertToRelativeUrl(post.imageUrl, urlPatterns);

      if (post.imageUrl !== originalUrl) {
        console.log(`✅ Post ${post._id}: ${originalUrl} → ${post.imageUrl}`);
        updatedImages++;
        needsUpdate = true;
      }
    }

    // Nettoyer la vidéo
    if (post.videoUrl && post.videoUrl.startsWith('http')) {
      const originalUrl = post.videoUrl;
      post.videoUrl = convertToRelativeUrl(post.videoUrl, urlPatterns);

      if (post.videoUrl !== originalUrl) {
        console.log(`✅ Post ${post._id}: ${originalUrl} → ${post.videoUrl}`);
        updatedVideos++;
        needsUpdate = true;
      }
    }

    // Nettoyer le thumbnail
    if (post.thumbnailUrl && post.thumbnailUrl.startsWith('http')) {
      const originalUrl = post.thumbnailUrl;
      post.thumbnailUrl = convertToRelativeUrl(post.thumbnailUrl, urlPatterns);

      if (post.thumbnailUrl !== originalUrl) {
        console.log(`✅ Post ${post._id}: ${originalUrl} → ${post.thumbnailUrl}`);
        updatedThumbnails++;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await post.save();
    }
  }

  console.log(`\n📊 Post URLs summary:`);
  console.log(`  - Updated images: ${updatedImages}`);
  console.log(`  - Updated videos: ${updatedVideos}`);
  console.log(`  - Updated thumbnails: ${updatedThumbnails}`);
}

/**
 * Convertit une URL absolue en URL relative
 */
function convertToRelativeUrl(url, patterns) {
  let relativeUrl = url;

  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      relativeUrl = relativeUrl.replace(pattern, '');
    } else {
      relativeUrl = relativeUrl.replace(pattern, '');
    }
  }

  // S'assurer que l'URL commence par /
  if (!relativeUrl.startsWith('/')) {
    relativeUrl = '/' + relativeUrl;
  }

  // Si c'est une URL externe (YouTube, etc.), la laisser telle quelle
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')) {
    return url;
  }

  return relativeUrl;
}

// Run migration
migrateUrls();
