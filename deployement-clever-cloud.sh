#!/bin/bash

# ==========================================
# Script de Déploiement Robuste pour Clever Cloud V2
# Avec vérifications complètes et gestion d'erreurs
# ==========================================

set -e  # Arrêter en cas d'erreur

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CLEVER_APP_ID="app_8a0fbd58-42ee-4661-bb09-fd1d484f8ad8"
CLEVER_REMOTE="clever"
CLEVER_GIT_URL="git+ssh://git@push-n3-par-clevercloud-customers.services.clever-cloud.com/${CLEVER_APP_ID}.git"

# Fonctions utilitaires
print_header() {
    echo -e "\n${MAGENTA}╔$($1 | sed 's/./═/g')═╗${NC}"
    echo -e "${MAGENTA}║ $1 ║${NC}"
    echo -e "${MAGENTA}╚$($1 | sed 's/./═/g')═╝${NC}\n"
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# Vérification qu'on est dans le bon répertoire
check_directory() {
    print_step "Vérification du répertoire..."

    if [ ! -f "package.json" ]; then
        print_error "package.json non trouvé!"
        print_info "Assurez-vous d'être dans le répertoire backend"
        exit 1
    fi

    if [ ! -f "Dockerfile" ]; then
        print_error "Dockerfile non trouvé!"
        exit 1
    fi

    if [ ! -f "src/server.production.js" ]; then
        print_error "src/server.production.js non trouvé!"
        exit 1
    fi

    if [ ! -f "src/healthcheck.js" ]; then
        print_error "src/healthcheck.js non trouvé!"
        exit 1
    fi

    print_success "Tous les fichiers nécessaires sont présents"
}

# Vérification de Git
check_git() {
    print_step "Vérification de Git..."

    if ! command -v git &> /dev/null; then
        print_error "Git n'est pas installé"
        exit 1
    fi

    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Pas dans un dépôt Git"
        exit 1
    fi

    print_success "Git OK"
}

# Vérification de l'état Git
check_git_status() {
    print_step "Vérification de l'état Git..."

    if [ -n "$(git status --porcelain)" ]; then
        print_warning "Modifications non commitées détectées:"
        git status --short
        echo ""
        read -p "Voulez-vous commiter ces modifications? (o/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[OoYy]$ ]]; then
            git add .
            read -p "Message de commit: " commit_msg
            if [ -z "$commit_msg" ]; then
                commit_msg="Update configuration for Clever Cloud deployment"
            fi
            git commit -m "$commit_msg

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
            print_success "Modifications commitées"
        else
            print_error "Déploiement annulé - Commitez vos modifications d'abord"
            exit 1
        fi
    else
        print_success "Aucune modification non commitée"
    fi
}

# Vérifier le remote Clever Cloud
check_remote() {
    print_step "Vérification du remote Clever Cloud..."

    if git remote | grep -q "^${CLEVER_REMOTE}$"; then
        print_success "Remote '${CLEVER_REMOTE}' existe"

        # Vérifier que l'URL est correcte
        current_url=$(git remote get-url ${CLEVER_REMOTE})
        if [ "$current_url" != "$CLEVER_GIT_URL" ]; then
            print_warning "URL du remote incorrecte"
            print_info "Attendu: $CLEVER_GIT_URL"
            print_info "Actuel:  $current_url"
            read -p "Voulez-vous corriger l'URL? (o/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[OoYy]$ ]]; then
                git remote set-url ${CLEVER_REMOTE} ${CLEVER_GIT_URL}
                print_success "URL corrigée"
            fi
        fi
    else
        print_warning "Remote '${CLEVER_REMOTE}' n'existe pas"
        read -p "Voulez-vous l'ajouter? (O/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            git remote add ${CLEVER_REMOTE} ${CLEVER_GIT_URL}
            print_success "Remote '${CLEVER_REMOTE}' ajouté"
        else
            print_error "Remote requis pour le déploiement"
            exit 1
        fi
    fi
}

# Vérifier la connexion SSH à Clever Cloud
check_ssh() {
    print_step "Vérification de la connexion SSH..."

    # Ajouter la clé du serveur si nécessaire
    if ! ssh-keygen -F push-n3-par-clevercloud-customers.services.clever-cloud.com > /dev/null 2>&1; then
        print_info "Ajout de la clé SSH du serveur Clever Cloud..."
        ssh-keyscan push-n3-par-clevercloud-customers.services.clever-cloud.com >> ~/.ssh/known_hosts 2>/dev/null
    fi

    # Tester la connexion
    print_info "Test de connexion SSH (ceci peut échouer, c'est normal)..."
    if ssh -T git@push-n3-par-clevercloud-customers.services.clever-cloud.com 2>&1 | grep -q "successfully authenticated"; then
        print_success "Authentification SSH réussie"
    else
        print_warning "Test SSH non concluant"
        print_info "La connexion sera testée lors du push"
    fi
}

# Valider les fichiers critiques
validate_files() {
    print_step "Validation des fichiers de configuration..."

    local errors=0

    # Vérifier que Dockerfile existe
    if [ ! -f "Dockerfile" ]; then
        print_error "Dockerfile manquant"
        ((errors++))
    fi

    # Vérifier healthcheck.js
    if ! grep -q "cleverHealthCheck" src/healthcheck.js; then
        print_error "cleverHealthCheck non trouvé dans healthcheck.js"
        ((errors++))
    fi

    # Vérifier server.production.js
    if ! grep -q "connectDatabaseAsync" src/server.production.js; then
        print_error "connectDatabaseAsync non trouvé dans server.production.js"
        ((errors++))
    fi

    if [ $errors -gt 0 ]; then
        print_error "$errors fichier(s) invalide(s)"
        exit 1
    fi

    print_success "Tous les fichiers sont valides"
}

# Préparer les fichiers pour le déploiement
prepare_deployment() {
    print_step "Préparation des fichiers pour le déploiement..."

    # Vérifier que les fichiers de production sont présents
    if [ ! -f "src/healthcheck.js" ] || [ ! -f "src/server.production.js" ]; then
        print_error "Fichiers de production manquants!"
        exit 1
    fi

    if [ ! -f "Dockerfile" ]; then
        print_error "Dockerfile manquant!"
        exit 1
    fi

    print_success "Tous les fichiers sont prêts"
}

# Afficher le résumé
show_summary() {
    local branch=$(git branch --show-current)

    echo -e "\n${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           RÉSUMÉ DU DÉPLOIEMENT                      ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC} Application:  ${YELLOW}${CLEVER_APP_ID}${NC}"
    echo -e "${CYAN}║${NC} Remote:       ${YELLOW}${CLEVER_REMOTE}${NC}"
    echo -e "${CYAN}║${NC} Branche:      ${YELLOW}${branch} → master${NC}"
    echo -e "${CYAN}║${NC} Dockerfile:   ${YELLOW}Dockerfile (multi-stage optimisé)${NC}"
    echo -e "${CYAN}║${NC} Server:       ${YELLOW}server.production.js${NC}"
    echo -e "${CYAN}║${NC} Health:       ${YELLOW}/health (toujours 200)${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}\n"
}

# Demander confirmation
confirm_deployment() {
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo -e "   Assurez-vous d'avoir configuré les variables d'environnement sur Clever Cloud:"
    echo -e "   ${CYAN}• MONGODB_URI${NC} - Connexion MongoDB"
    echo -e "   ${CYAN}• JWT_SECRET${NC}  - Clé secrète JWT"
    echo -e "   ${CYAN}• NODE_ENV${NC}    - production"
    echo -e "   ${CYAN}• CLIENT_URL${NC}  - URL du frontend\n"

    echo -e "${YELLOW}Configuration via console:${NC} https://console.clever-cloud.com"
    echo -e "${YELLOW}Ou via CLI:${NC} clever env set VARIABLE 'value'\n"

    read -p "Avez-vous configuré toutes les variables d'environnement? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[OoYy]$ ]]; then
        print_error "Configuration requise avant le déploiement"
        print_info "Consultez .env.clever.example pour la liste complète"
        cleanup_on_error
        exit 1
    fi

    echo ""
    read -p "Confirmer le déploiement? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[OoYy]$ ]]; then
        print_error "Déploiement annulé"
        cleanup_on_error
        exit 1
    fi
}

# Déployer
deploy() {
    local branch=$(git branch --show-current)

    print_step "Déploiement vers Clever Cloud..."

    echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Pushing to Clever Cloud...${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

    # Push vers Clever Cloud
    if git push -u ${CLEVER_REMOTE} ${branch}:master; then
        print_success "Code pushé avec succès!"
        return 0
    else
        print_error "Échec du push vers Clever Cloud"
        return 1
    fi
}

# Nettoyage en cas d'erreur
cleanup_on_error() {
    print_info "Aucun nettoyage nécessaire"
}

# Post-déploiement
post_deploy() {
    echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        ✓ DÉPLOIEMENT LANCÉ AVEC SUCCÈS!              ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}\n"

    print_info "Le build est en cours sur Clever Cloud..."
    echo ""

    echo -e "${CYAN}📊 Suivi du déploiement:${NC}"
    echo -e "   Console: ${YELLOW}https://console.clever-cloud.com${NC}"
    echo -e "   Logs:    ${YELLOW}clever logs -f${NC} (si CLI installé)\n"

    echo -e "${CYAN}🔍 Une fois déployé, vérifiez:${NC}"
    echo -e "   Health:  ${YELLOW}https://${CLEVER_APP_ID}.cleverapps.io/health${NC}"
    echo -e "   API:     ${YELLOW}https://${CLEVER_APP_ID}.cleverapps.io/api/health${NC}\n"

    echo -e "${CYAN}📝 Prochaines étapes:${NC}"
    echo -e "   1. Surveillez les logs de build dans la console"
    echo -e "   2. Vérifiez que toutes les variables d'environnement sont configurées"
    echo -e "   3. Testez le endpoint /health"
    echo -e "   4. Testez votre API\n"

    echo -e "${CYAN}🆘 En cas de problème:${NC}"
    echo -e "   • Consultez les logs: ${YELLOW}clever logs${NC}"
    echo -e "   • Vérifiez les variables: ${YELLOW}clever env${NC}"
    echo -e "   • Redémarrez l'app: ${YELLOW}clever restart${NC}\n"
}

# Fonction principale
main() {
    print_header "DÉPLOIEMENT CLEVER CLOUD - VERSION ROBUSTE"

    # Étape 1: Vérifications pré-déploiement
    check_directory
    check_git
    check_git_status
    check_remote
    check_ssh
    validate_files

    # Étape 2: Préparation
    prepare_deployment

    # Étape 3: Résumé et confirmation
    show_summary
    confirm_deployment

    # Étape 4: Déploiement
    if deploy; then
        post_deploy
        exit 0
    else
        print_error "Le déploiement a échoué"
        cleanup_on_error
        exit 1
    fi
}

# Gestion des erreurs
trap 'cleanup_on_error' ERR

# Lancer le script
main
