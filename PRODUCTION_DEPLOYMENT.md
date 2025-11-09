# 🚀 Thot Backend - Déploiement Production

## ✅ Statut : DÉPLOYÉ ET EN LIGNE

Le backend Thot est maintenant **déployé en production** et accessible publiquement.

---

## 🌐 URLs de Production

### Backend API
- **URL principale** : `http://37.59.106.113`
- **Health check** : `http://37.59.106.113/health`
- **API posts** : `http://37.59.106.113/api/posts`
- **Upload** : `http://37.59.106.113/api/upload`

### VPS
- **IP** : `37.59.106.113`
- **IPv6** : `2001:41d0:305:2100::b015`
- **Région** : Gravelines (GRA) - France
- **OS** : Ubuntu 24.04.3 LTS
- **Resources** : 6 vCores, 12 GB RAM, 100 GB Storage

---

## 🔧 Configuration Serveur

### Services Installés

✅ **Node.js** : v20.19.5
✅ **NPM** : v10.8.2
✅ **PM2** : Installé et configuré
✅ **MongoDB** : v7.0.25 (actif)
✅ **Nginx** : v1.24.0 (reverse proxy)

### Structure

```
/var/www/thot-backend/
├── src/
├── node_modules/
├── .env
├── ecosystem.config.js
├── logs/
│   ├── out.log
│   ├── err.log
│   └── combined.log
└── package.json
```

---

## 🔐 Configuration Environnement

### Variables d'environnement (.env sur VPS)

```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/thot
JWT_SECRET=your-super-secret-jwt-key-change-in-production-minimum-32-characters-long-thot-2025
S3_ACCESS_KEY_ID=3362f96514e14af38a9710cb60c5fff1
S3_SECRET_ACCESS_KEY=79a7bc7abc5940f29e6bf01afb32d3a0
S3_REGION=rbx
S3_ENDPOINT=https://s3.rbx.io.cloud.ovh.net
S3_BUCKET_NAME=thot-3sd
API_BASE_URL=http://37.59.106.113
CLIENT_URL=http://37.59.106.113
```

---

## 📦 Stockage S3

### OVH Object Storage

- **Bucket** : `thot-3sd`
- **Région** : RBX (Roubaix)
- **Endpoint** : `https://s3.rbx.io.cloud.ovh.net`
- **URL publique** : `https://thot-3sd.s3.rbx.io.cloud.ovh.net/`

### Structure des fichiers

```
thot-3sd/
├── profile/     # Photos de profil
├── cover/       # Photos de couverture
├── article/     # Images d'articles
├── video/       # Vidéos
├── short/       # Shorts
├── podcast/     # Fichiers audio
└── question/    # Images de questions
```

---

## 🔄 Déploiement

### Méthode 1 : GitHub Actions (Automatique)

À chaque push sur `main`, GitHub Actions déploie automatiquement :

```bash
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin main
```

### Méthode 2 : Script Manuel

```bash
./deploy-direct.sh
```

Ce script :
1. Copie les fichiers vers le VPS via rsync
2. Installe les dépendances
3. Redémarre PM2
4. Vérifie la santé du backend

---

## 🛠️ Commandes de Gestion

### SSH (via sshpass)

```bash
# Se connecter au VPS
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113

# Ou avec une commande directe
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'commande'
```

### PM2 (Process Manager)

```bash
# Voir le statut
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 status'

# Voir les logs en temps réel
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 logs thot-backend'

# Voir les logs (50 dernières lignes)
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 logs thot-backend --lines 50 --nostream'

# Redémarrer
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 restart thot-backend'

# Arrêter
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 stop thot-backend'

# Supprimer
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 delete thot-backend'
```

### MongoDB

```bash
# Statut MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl status mongod'

# Redémarrer MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl restart mongod'

# Se connecter au shell MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'mongosh'
```

### Nginx

```bash
# Statut Nginx
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl status nginx'

# Tester la configuration
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo nginx -t'

# Redémarrer Nginx
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl restart nginx'

# Voir les logs d'accès
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo tail -f /var/log/nginx/access.log'

# Voir les logs d'erreur
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo tail -f /var/log/nginx/error.log'
```

---

## 📱 Configuration Mobile Flutter

### URLs mises à jour

Le mobile Flutter a été configuré pour utiliser automatiquement l'API de production :

**Fichiers modifiés** :
- `lib/core/network/api_config.dart` : URL de production = `http://37.59.106.113`
- `lib/features/media/utils/url_helper.dart` : Fallback = `http://37.59.106.113`

En mode **Release**, le mobile utilisera automatiquement `http://37.59.106.113`.
En mode **Debug**, il utilisera localhost/ngrok selon la configuration.

---

## 🧪 Tests de Santé

### Backend

```bash
# Health check
curl http://37.59.106.113/health

# Expected response:
# {
#   "status": "OK",
#   "message": "Thot API is healthy",
#   "timestamp": "2025-10-24T05:15:02.839Z",
#   "database": "connected"
# }
```

### API

```bash
# Liste des posts
curl http://37.59.106.113/api/posts

# Upload test (nécessite authentification)
curl -X POST -F "file=@test.jpg" -F "type=article" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://37.59.106.113/api/upload
```

---

## 🐛 Dépannage

### Backend ne répond pas

```bash
# 1. Vérifier que PM2 tourne
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 list'

# 2. Voir les logs d'erreur
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 logs thot-backend --err --lines 100'

# 3. Redémarrer
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 restart thot-backend'
```

### 502 Bad Gateway

```bash
# 1. Vérifier que le backend écoute sur le port 3000
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'netstat -tlnp | grep 3000'

# 2. Tester en local sur le VPS
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'curl http://localhost:3000/health'

# 3. Vérifier la config Nginx
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo nginx -t'
```

### MongoDB n'est pas connecté

```bash
# 1. Vérifier que MongoDB tourne
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl status mongod'

# 2. Redémarrer MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl restart mongod'

# 3. Vérifier les logs MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo journalctl -u mongod --since "10 minutes ago"'
```

---

## 📋 Checklist de Déploiement

### ✅ Backend
- [x] Node.js installé (v20.19.5)
- [x] PM2 configuré et actif
- [x] MongoDB installé et démarré
- [x] Nginx configuré comme reverse proxy
- [x] Firewall ouvert (ports 80, 22)
- [x] .env créé avec toutes les variables
- [x] S3 OVH configuré et testé
- [x] Application démarrée et accessible
- [x] Health check répond correctement

### ✅ Mobile Flutter
- [x] URL de production mise à jour
- [x] Configuration API modifiée
- [x] URL helper mis à jour

### ✅ CI/CD
- [x] GitHub Action créée
- [x] Script de déploiement manuel créé
- [x] Auto-deployment sur push main

---

## 🔒 Sécurité

### ⚠️ Actions recommandées

1. **Changer le mot de passe SSH** :
   ```bash
   sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'passwd'
   ```

2. **Configurer une clé SSH** (plus sécurisé que mot de passe) :
   ```bash
   ssh-keygen -t ed25519 -C "thot-vps"
   ssh-copy-id ubuntu@37.59.106.113
   ```

3. **Configurer le firewall UFW** :
   ```bash
   sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo ufw enable'
   ```

4. **Changer JWT_SECRET** dans .env production

5. **Configurer HTTPS avec Let's Encrypt** (optionnel) :
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## 📊 Monitoring

### Logs en temps réel

```bash
# Backend logs
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 logs thot-backend'

# Nginx access logs
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo tail -f /var/log/nginx/access.log'

# System logs
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo journalctl -f'
```

### Métriques

```bash
# Statut du serveur
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'top -bn1 | head -20'

# Utilisation disque
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'df -h'

# Utilisation mémoire
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'free -h'
```

---

## 🔄 Workflow de Développement

### 1. Développement Local

```bash
cd thot_backend
npm install
npm run dev
```

### 2. Tests

```bash
npm test
```

### 3. Commit & Push

```bash
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin main
```

### 4. Déploiement Automatique

GitHub Actions déploie automatiquement sur le VPS.

### 5. Vérification

```bash
curl http://37.59.106.113/health
```

---

## 📦 Mise à Jour

### Mettre à jour les dépendances

```bash
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 << 'EOF'
cd /var/www/thot-backend
npm update
pm2 restart thot-backend
EOF
```

### Mettre à jour Node.js

```bash
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 << 'EOF'
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
pm2 restart thot-backend
EOF
```

---

## 🏗️ Architecture

```
Internet
    ↓
Nginx (port 80) ← Reverse Proxy
    ↓
Node.js Backend (port 3000) ← Express + PM2
    ↓
MongoDB (port 27017) ← Database locale
    ↓
OVH S3 (RBX) ← Stockage fichiers
```

---

## ✨ Fonctionnalités Actives

### Backend
- ✅ API REST complète
- ✅ Authentification JWT
- ✅ Upload S3 (images, vidéos, audio)
- ✅ WebSocket (Socket.IO)
- ✅ Rate limiting
- ✅ Security headers
- ✅ CORS configuré
- ✅ MongoDB connection pooling
- ✅ Auto-scaling PM2

### Stockage
- ✅ S3 OVH configuré
- ✅ Upload direct vers S3
- ✅ URLs publiques
- ✅ Métadonnées (dimensions, taille)
- ✅ Gestion des types de fichiers
- ✅ Suppression automatique anciens fichiers

---

## 📞 Support

### Logs Utiles

```bash
# Logs backend (dernières 100 lignes)
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 logs thot-backend --lines 100 --nostream'

# Logs MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo journalctl -u mongod -n 100'

# Logs Nginx erreurs
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo tail -100 /var/log/nginx/error.log'
```

### Commandes de Debug

```bash
# Tester la connexion MongoDB
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'mongosh --eval "db.adminCommand({ ping: 1 })"'

# Tester S3
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'cd /var/www/thot-backend && node -e "require(\"./src/services/s3.service\")"'

# Vérifier les ports ouverts
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo netstat -tlnp'
```

---

## 🎯 Prochaines Étapes

### Recommandé

1. **Configurer un nom de domaine** :
   - Acheter/configurer un domaine (ex: `api.thot.com`)
   - Pointer vers `37.59.106.113`
   - Configurer HTTPS avec Let's Encrypt

2. **Configurer HTTPS** :
   ```bash
   sudo certbot --nginx -d api.thot.com
   ```

3. **Mettre en place des backups MongoDB** :
   ```bash
   # Script de backup automatique
   mongodump --out /backups/mongo/$(date +%Y%m%d)
   ```

4. **Configurer Redis** (pour rate limiting distribué)

5. **Monitoring avancé** :
   - Sentry pour tracking des erreurs
   - Grafana + Prometheus pour métriques

### Optionnel

- Docker containerization
- Load balancer
- CDN pour les assets S3
- Replica MongoDB
- Auto-scaling

---

## 📱 Configuration App Mobile

Pour que l'app mobile utilise l'API de production :

1. **Build en mode Release** :
   ```bash
   cd thot_mobile
   flutter build apk --release
   flutter build ios --release
   ```

2. L'app utilisera automatiquement `http://37.59.106.113` en production

3. Pour forcer l'URL de prod en dev :
   ```bash
   flutter run --dart-define=API_BASE_URL=http://37.59.106.113
   ```

---

## ✅ Vérification Finale

```bash
# Backend health
curl http://37.59.106.113/health

# API posts
curl http://37.59.106.113/api/posts

# PM2 status
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'pm2 status'

# MongoDB status
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl is-active mongod'

# Nginx status
sshpass -p 'Amaury262879?' ssh ubuntu@37.59.106.113 'sudo systemctl is-active nginx'
```

**Tout doit retourner "OK" ou "active"** ✅

---

**Date de déploiement** : 24 Octobre 2025
**Version** : 1.0.0
**Statut** : 🟢 Production Ready
