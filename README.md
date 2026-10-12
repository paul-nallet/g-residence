# GResidence

Gestionnaire d’une résidence étudiante : comptes, lots, séjours, préavis, états des lieux, calendrier, bilan hebdomadaire, relevés des compteurs des communs, stocks, ménage, chiffre d’affaires des prestations et suivi technique. React, Astryx Neutral, Effect et Workers avec D1 local.

## Démarrer

Node >= 22.18 et npm.

```bash
rtk npm install
rtk npm run dev
```

Ouvrir http://127.0.0.1:8790 et créer la résidence et son premier administrateur. Le démarrage applique les migrations locales puis compile le front. Les données sont conservées dans `.wrangler/state`. Aucun compte Cloudflare nécessaire.

Pour le rechargement du front, garder le backend actif et lancer `rtk npm run frontend`, puis ouvrir http://127.0.0.1:5174.

## Parcours V1

- Connexion et déconnexion, invitations par lien copiable, rôles administrateur, gestionnaire et ménage.
- Lots avec recherche, filtres et pagination côté API ; détail et historique.
- Séjours successifs sans chevauchement, confirmations explicites d’entrée et de sortie.
- Préavis avec dates manuelles, correction et retrait tracés.
- États des lieux prévus, réalisés ou annulés, déplaçables, indépendants des confirmations des mouvements.
- Calendrier semaine/mois et liste quotidienne compacte, fuseau Europe/Paris.
- Compteurs d’eau, d’électricité et de gaz des communs : suivi mensuel, index datés, historique paginé et corrections tracées.
- Ménage : fiches modèles (tâches à faire, points à vérifier, fiche par défaut ou par lot), planning jour/semaine par agent, checklist cochée par l’agent, anomalies et réalisation.
- Stocks : articles, catégories et vues, entrées, sorties et inventaires tracés, alertes de stock faible.
- Prestations : sources configurables, chiffre d’affaires mensuel, récapitulatif annuel et copie Excel.
- Technique : lieux, fournisseurs, signalements, travaux avec journal et interventions au calendrier.
- Boîte à idées, barre d’actions ⌘K et synchronisation automatique des pages ouvertes.
- Bilan lundi-dimanche des événements réalisés et préavis reçus actifs, aperçu et copie tabulée pour Excel. Sélection manuelle si le presse-papiers est indisponible.

Le ménage consulte les lots et les mouvements sans noms, commentaires ni rapports, et ne voit que ses propres tâches de ménage. Les permissions sont contrôlées côté serveur. Les lots ayant un historique sont archivés ; les corrections et annulations sont tracées.

## Stockage et installation

`rtk npm run db:local` applique uniquement les migrations locales. La base principale est vierge pour la première installation. La validation manuelle utilise une base séparée `.wrangler/v1-validation`, sans remplir la base principale. Pour reprendre uniquement cette validation après compilation :

```bash
rtk proxy npx wrangler dev --port 8791 --persist-to .wrangler/v1-validation
```

La configuration D1 contient un identifiant réservé au développement local. Aucun déploiement distant effectué. Une installation publique nécessitera une vraie ressource D1 et `ADMIN_EMAIL` ; sans email administrateur configuré, l’installation publique est verrouillée. Sessions par cookie HttpOnly, mots de passe hachés, limitation des tentatives et protection des mutations intersites.

## AI Studio

Panneau latéral (icône ✦ de la barre supérieure) pour questionner l’état de la résidence et préparer des micro-actions. Le modèle lit les données via des outils bornés au rôle de l’utilisateur ; toute modification (mouvement de stock, relevé de compteur, statut de ménage) est une proposition appliquée seulement après confirmation.

Désactivé par défaut. Pour l’activer en local, créer `.dev.vars` :

```
AI_PROVIDER=anthropic
AI_API_KEY=...
AI_MODEL=claude-opus-5-5
```

`AI_MODEL` est facultatif. Le fournisseur est un port (`src/services/AiProvider.ts`) : un autre fournisseur s’ajoute par un adaptateur, sans toucher au studio.

## Vérifier

```bash
rtk npm run check
```

Build, types, lint, format, tests et bundle Worker sans déploiement. Les tests utilisent SQLite en mémoire avec toutes les migrations. `rtk npm run types` régénère les bindings Wrangler.

## Suite

Périmètre livré et questions ouvertes : voir `PRODUCT.md`. Restent hors périmètre : import Excel, portail résident, documents signés, photos, emails automatiques et récupération de mot de passe en libre-service. L’équipement par lot conserve sa page de cadrage.

## Références

`PRODUCT.md`, `DESIGN.md`, `docs/decisions/0001-socle.md`, `docs/decisions/0002-v1.md`, `AGENTS.md` et `CLAUDE.md`.
