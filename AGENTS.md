# Instructions du projet

Utiliser les conventions Commitizen : `fix|feat|chore|doc|refactor(subject): description`, puis le lien de carte lorsqu'il est fourni. Ne pas inventer de lien. Suivre `/Users/paul/.codex/RTK.md` : préfixer les commandes shell par `rtk`.

## Références

Lire `PRODUCT.md`, `DESIGN.md` et `docs/decisions/0001-socle.md` avant de modifier le produit. L'initialisation ne vaut pas validation du périmètre V1. Code, interface et documentation métier en français ; identifiants techniques en anglais.

## Architecture

React 19, Astryx Neutral et Vite pour le front ; Effect 4 (HttpApi, Schema, services et Layers), TypeScript strict et Cloudflare Workers pour le serveur. Contrat partagé dans `src/api/Api.ts`, domaine pur dans `src/domain/`, handlers dans `src/server/`, ports et adaptateurs futurs dans `src/services/`. Le front consomme le client HttpApi typé. Filtrage, tri et pagination des données persistées côté API.

D1 sera le stockage relationnel de la V1 ; R2 seulement quand les fichiers seront nécessaires. Aucune donnée privée ni aucun endpoint métier public avant l'authentification et le contrôle des permissions. La résidence porte le périmètre des données. Toute future requête métier doit être bornée à la résidence autorisée.

## Coûts

Aucun traitement en arrière-plan (Cron, Durable Object, Queue, Workflow, WebSocket) sans décision écrite et chiffrée. Un seul sondeur côté front, `frontend/lib/sync.ts` : jamais de rechargement périodique dans une page. Lire `docs/decisions/0006-couts-cloudflare.md`.

## Interface Astryx

Importer `@astryxdesign/core/reset.css` et `@astryxdesign/core/astryx.css` à l'entrée. Pour chaque nouvelle page : `npx astryx build "<besoin>"`, puis `npx astryx template <nom> <chemin>` ; garder son cadre. Consulter `npx astryx docs layout` avant de modifier le cadre et `npx astryx component <Nom>` avant d'utiliser un composant inconnu.

Composition avec les composants, sans `div` ou `span` de layout. Données denses en Table ou List/Item, Card pour un widget autonome. États en Token ou StatusDot ; Badge pour les compteurs. Props d'abord, tokens ensuite ; aucune feuille CSS personnalisée, couleur ou dimension visuelle codée en dur. Accent défini dans le thème. Actions utilisables au clavier et sur mobile, libellés accessibles, erreurs et confirmations explicites.

## Vérification

`npm run check` : build, types, lint, format, tests, bundle Worker sans déploiement. `public/` est généré. Imports relatifs avec extension `.ts` ou `.tsx`. Format oxfmt : 120 colonnes, sans point-virgule, guillemets simples. Pas de commentaires redondants dans le code. Consulter `node_modules/effect/AGENTS.md` et `node_modules/effect/ai-docs/` pour les APIs Effect.
