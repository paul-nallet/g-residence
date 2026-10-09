# 0001 — Socle technique

Date : 9 octobre 2026. Statut : choix de démarrage pour l'initialisation demandée.

## Origine

Inspiration : `../cloudflare-remote-email/AGENTS.md`, `CLAUDE.md`, `DESIGN.md`. Reprendre l'architecture et les règles de construction, sans importer les emails, l'IA, les données ou les identifiants Cloudflare de ce projet.

## Choix

- React 19 + Vite + Astryx Neutral, français à l'entrée de l'application.
- TypeScript strict ; Effect 4 Schema et HttpApi pour le contrat serveur/front.
- Worker Cloudflare et Static Assets pour servir l'API et l'application.
- Oxfmt, Oxlint, tests natifs Node ; dépendances verrouillées par package-lock.
- D1 prévu pour les données relationnelles à la V1 ; migrations ajoutées avec le premier parcours métier, pas de base distante créée durant l'initialisation.
- R2 prévu pour les photos/documents lorsque ce besoin sera confirmé. Pas de Queues, IA, Email Routing ou Durable Objects sans besoin concret.

## Frontières

`src/domain/` ne dépend pas d'un fournisseur. `src/api/` définit les échanges partagés. `src/server/` compose les handlers et Layers. Les futurs `src/services/` exposeront les ports métier et leurs adaptateurs, dont D1. `frontend/features/` accueillera les parcours au fur et à mesure ; ne pas créer des modules vides pour chaque besoin.

Authentification à construire avant toute exposition de données privées : comptes, invitations, sessions en cookie HttpOnly, contrôle d'origine des mutations et droits par résidence. Le modèle du projet précédent est une référence à réévaluer ; aucun code d'authentification n'est prétendu livré ici.

## Conséquences

L'application fonctionne localement sans compte Cloudflare ni secret. L'API publique ne contient que la santé du socle. Un endpoint inconnu reste une erreur API et ne retombe pas sur le HTML. Pas de script de déploiement produit avant authentification et configuration des ressources de cette application.
