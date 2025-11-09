# Configuration S3 OVH - Thot Backend

## ✅ Configuration Terminée

Le backend est maintenant configuré pour utiliser le stockage S3 OVH pour tous les uploads (images, vidéos, audio).

## 🔧 Configuration

### Variables d'environnement (.env)

```bash
S3_ACCESS_KEY_ID=3362f96514e14af38a9710cb60c5fff1
S3_SECRET_ACCESS_KEY=79a7bc7abc5940f29e6bf01afb32d3a0
S3_REGION=rbx
S3_ENDPOINT=https://s3.rbx.io.cloud.ovh.net
S3_BUCKET_NAME=thot-3sd
```

### Informations du Container

- **Nom**: thot-3sd
- **Région**: RBX (Roubaix) - 1-AZ
- **Endpoint**: https://s3.rbx.io.cloud.ovh.net/
- **URL publique**: https://thot-3sd.s3.rbx.io.cloud.ovh.net/
- **Utilisateur**: user-8WHY9JBwKHVQ (thot-s3-access)

## 📦 Packages Installés

```json
{
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x"
}
```

## 🚀 Utilisation

### 1. Service S3 (`src/services/s3.service.js`)

Le service S3 gère toutes les opérations de stockage :

- **Upload de fichier** : `uploadFile(buffer, key, contentType, metadata)`
- **Suppression** : `deleteFile(key)`
- **URL signée** : `getSignedUrl(key, expiresIn)`
- **URL publique** : `getPublicUrl(key)`
- **Génération de clé** : `generateKey(type, filename)`

### 2. Controller Upload Modifié

Le controller `upload.controller.js` utilise maintenant :
- `multer.memoryStorage()` au lieu du stockage disque
- Upload direct vers S3 depuis le buffer mémoire
- Suppression automatique des anciens fichiers sur S3 (profile/cover)

### 3. Structure des Uploads

Les fichiers sont organisés par type sur S3 :

```
thot-3sd/
├── profile/
│   └── 1730000000-123456789-filename.jpg
├── cover/
│   └── 1730000000-987654321-filename.jpg
├── article/
├── video/
├── short/
├── podcast/
└── question/
```

## 🔄 Migration depuis le Stockage Local

**Important** : Les fichiers existants en local (`/uploads/*`) ne sont PAS migrés automatiquement vers S3.

### Options :

1. **Migrer manuellement** : Utiliser `rclone` ou AWS CLI
2. **Dual Storage** : Garder les anciens fichiers en local, nouveaux sur S3
3. **URL Proxy** : Servir les anciens fichiers via le backend

## 🧪 Tests

Tous les tests S3 ont réussi :

✅ Upload de fichier
✅ Génération d'URL publique
✅ Génération d'URL signée
✅ Suppression de fichier

## 📱 Flutter Mobile

Le code Flutter (`lib/features/media/infrastructure/upload_service.dart`) est déjà compatible :
- Utilise l'API backend pour les uploads
- Le backend gère automatiquement le stockage S3
- Aucune modification nécessaire côté mobile

## 🔐 Sécurité

- Les credentials S3 sont stockés dans `.env` (non versionné)
- ACL configuré en `public-read` pour les fichiers uploadés
- Les URLs signées expirent après 1 heure par défaut

## 📊 Monitoring

Logs automatiques dans la console :
- `[S3] S3 Service initialized` : Initialisation du service
- `[S3] File uploaded successfully` : Upload réussi
- `[S3] File deleted successfully` : Suppression réussie
- `[S3] Generated signed URL` : URL signée générée

## 🛠️ Dépannage

### Erreur "SignatureDoesNotMatch"
- Vérifier que Access Key et Secret Key correspondent au même utilisateur

### Erreur "NoSuchBucket"
- Vérifier le nom du bucket : `thot-3sd`
- Vérifier la région : `rbx`
- Vérifier l'endpoint : `https://s3.rbx.io.cloud.ovh.net`

### Erreur "AccessDenied"
- Vérifier les permissions de l'utilisateur S3
- L'utilisateur doit avoir le rôle "Administrator"

## 🔗 Ressources

- [Documentation OVH S3](https://docs.ovh.com/fr/storage/s3/)
- [AWS SDK S3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
