/**
 * Script pour tester la génération d'avatars
 * Génère des exemples d'images pour visualiser le résultat
 */

const fs = require('fs');
const path = require('path');
const {
  generateAvatar,
  generateCoverImage,
  generatePostImage
} = require('../src/utils/avatarGenerator');

const OUTPUT_DIR = path.join(__dirname, '../test-generated-images');

// Créer le dossier de sortie
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎨 Generating test images...\n');

// Test 1: Avatars utilisateurs
console.log('📸 Generating user avatars...');
const users = [
  { id: '1', name: 'Jean Michel', isJournalist: false },
  { id: '2', name: 'Marie Dupont', isJournalist: false },
  { id: '3', name: 'Amaury Poltavtseef', isJournalist: true },
  { id: '4', name: 'Sophie Martin', isJournalist: true },
  { id: '5', name: 'A', isJournalist: false }, // Un seul caractère
  { id: '6', name: 'John Doe Test Long Name', isJournalist: false } // Nom long
];

users.forEach(user => {
  const avatar = generateAvatar(user.id, user.name, { isJournalist: user.isJournalist });
  const filename = `avatar-${user.name.replace(/\s+/g, '-').toLowerCase()}.png`;
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), avatar);
  console.log(`  ✅ Generated: ${filename}`);
});

// Test 2: Covers
console.log('\n🎨 Generating cover images...');
for (let i = 1; i <= 5; i++) {
  const cover = generateCoverImage(i.toString());
  const filename = `cover-${i}.png`;
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), cover);
  console.log(`  ✅ Generated: ${filename}`);
}

// Test 3: Images de posts
console.log('\n📰 Generating post images...');
const postTypes = ['article', 'video', 'short', 'question', 'podcast'];

postTypes.forEach(type => {
  const postImage = generatePostImage('1', type);
  const filename = `post-${type}.png`;
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), postImage);
  console.log(`  ✅ Generated: ${filename}`);
});

// Test 4: Différentes tailles d'avatars
console.log('\n📏 Generating avatars in different sizes...');
const sizes = [50, 100, 200, 400];

sizes.forEach(size => {
  const avatar = generateAvatar('test', 'Test User', { size });
  const filename = `avatar-size-${size}.png`;
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), avatar);
  console.log(`  ✅ Generated: ${filename} (${size}x${size})`);
});

console.log(`\n✅ All images generated successfully!`);
console.log(`📁 Output directory: ${OUTPUT_DIR}`);
console.log('\n💡 Open the files to see the results!\n');

// Afficher les stats
const files = fs.readdirSync(OUTPUT_DIR);
const totalSize = files.reduce((acc, file) => {
  const stats = fs.statSync(path.join(OUTPUT_DIR, file));
  return acc + stats.size;
}, 0);

console.log('📊 Statistics:');
console.log(`  - Total files: ${files.length}`);
console.log(`  - Total size: ${(totalSize / 1024).toFixed(2)} KB`);
console.log(`  - Average size: ${(totalSize / files.length / 1024).toFixed(2)} KB per file\n`);
