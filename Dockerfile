# ==========================================
# Dockerfile Production pour VPS OVH
# Optimisé avec multi-stage build
# ==========================================

# ==========================================
# Stage 1: Builder - Installation des dépendances et build
# ==========================================
FROM node:20-bullseye as builder

# Installation des dépendances système pour les packages natifs
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Outils de build
    build-essential \
    python3 \
    make \
    g++ \
    git \
    # Dépendances pour canvas
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    # Dépendances pour sharp
    libvips-dev \
    # Dépendances pour snappy
    libsnappy-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer TOUTES les dépendances (prod + dev) pour le build
# Certains packages natifs ont besoin de devDependencies pour compiler
RUN npm ci --include=dev && \
    npm cache clean --force

# Copier le code source
COPY . .

# ==========================================
# Stage 2: Production - Image finale optimisée
# ==========================================
FROM node:20-bullseye-slim

# Métadonnées
LABEL maintainer="Thot Backend Team"
LABEL description="Thot Journalism Platform Backend API"
LABEL version="1.0.0"

# Installer uniquement les dépendances runtime nécessaires
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Runtime pour canvas
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    # Runtime pour sharp
    libvips42 \
    # Runtime pour ffmpeg
    ffmpeg \
    # Runtime pour snappy
    libsnappy1v5 \
    # Outils système utiles
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Créer un utilisateur non-root pour la sécurité
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copier les node_modules depuis le builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Copier le code source
COPY --chown=appuser:appuser . .

# Créer les répertoires nécessaires avec les bonnes permissions
RUN mkdir -p uploads logs public/uploads test-generated-images && \
    chown -R appuser:appuser uploads logs public test-generated-images

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=8080 \
    # Optimisations Node.js pour production
    NODE_OPTIONS="--max-old-space-size=2048" \
    # Timezone
    TZ=Europe/Paris

# Exposer le port 8080 (requis par Clever Cloud)
EXPOSE 8080

# Passer à l'utilisateur non-root
USER appuser

# Health check optimisé pour Clever Cloud
# Utilise le nouveau endpoint qui retourne toujours 200
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Démarrer l'application avec le serveur production
# server.production.js gère mieux les erreurs MongoDB
CMD ["node", "src/server.production.js"]
