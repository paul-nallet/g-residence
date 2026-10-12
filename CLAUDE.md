# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# GResidence

@AGENTS.md

Gestion opérationnelle d'une résidence étudiante. Le produit est distinct du précédent projet de traitement d'emails. Lire `README.md` pour démarrer, `PRODUCT.md` pour les besoins et questions ouvertes, `DESIGN.md` pour les règles d'interface, `docs/decisions/0001-socle.md` pour les choix techniques.

La V1 livre comptes, lots, séjours, préavis, états des lieux, calendrier, bilan hebdomadaire, relevés des compteurs des communs, stocks, ménage (fiches, planning, checklists), chiffre d’affaires des prestations et suivi technique (lieux, fournisseurs, signalements, travaux, interventions) sur D1 local. Lire `docs/decisions/0002-v1.md`. Les autres domaines restent des pages de cadrage. Aucun déploiement distant autorisé pour cette étape : jamais de `wrangler deploy` sans `--dry-run`, ni de migration `--remote`.

## Commandes

- `rtk npm run dev` : migrations D1 locales, build du front, puis `wrangler dev` sur http://127.0.0.1:8790. Données dans `.wrangler/state`.
- `rtk npm run frontend` : Vite avec rechargement sur http://127.0.0.1:5174, proxy `/api` vers 8790 (garder `dev` actif).
- `rtk npm run check` : build, typecheck, oxlint, oxfmt `--check`, tests, `wrangler deploy --dry-run`.
- `rtk npm test` ; un seul fichier : `rtk node --test test/api.test.ts` ; un seul test : ajouter `--test-name-pattern "<nom>"`.
- `rtk npm run format` pour corriger le format ; `rtk npm run types` régénère `worker-configuration.d.ts` après un changement de `wrangler.jsonc`.
- Validation manuelle sur base séparée, sans toucher la base principale : `rtk proxy npx wrangler dev --port 8791 --persist-to .wrangler/v1-validation`.

## Architecture

- `src/index.ts` : Worker. `/api/*` va au handler Effect, le reste aux assets statiques (`public/`, généré par Vite depuis `frontend/`, SPA).
- `src/api/Api.ts` : contrat HttpApi unique (groupes, schémas, erreurs HTTP typées, `CurrentUser`, middlewares `SameOrigin` et `Authorization`, ce dernier lié au cookie de session `Session` déclaré par `HttpApiSecurity.apiKey`). Consommé par le serveur et par le client typé du front (`frontend/lib/api.ts`).
- `src/domain/` : un fichier par domaine (`accounts.ts`, `lots.ts`, `stays.ts`, `agenda.ts`, `meters.ts`, `stock.ts`, `cleaning.ts`, `revenue.ts`, `technical.ts`) avec ses schémas d'échange (entrées validées par Schema, messages français), ses erreurs métier `Schema.TaggedError` sans statut HTTP et ses règles propres. `shared.ts` porte les briques de schéma communes (`RequiredText`, `OptionalText`, `CivilDate`, `PageNumber`, `Email`, `Ok`…), `rules.ts` les règles pures transverses, `clock.ts` l'heure via `Clock`, `CurrentUser.ts` le rôle courant. `InvalidInput` (`errors.ts`) porte les contrôles croisés impossibles à exprimer dans un schéma.
- `src/services/` : `Database` est le port minimal (`all`, `first`, `batch` sur des `Statement` construits par `sql(...)`), avec l'adaptateur D1 ; `Sql` l'expose en Effect avec une `SqlError` typée. Chaque service (`Accounts`, `Lots`, `Stays`, `Agenda`, `Meters`, `Stock`, `Cleaning`, `Revenue`, `Technical`) est un `Context.Service` avec `static layer`, des méthodes `Effect.fn`, lit `CurrentUser` dans le contexte et reste borné au `residence_id`. Les violations de contraintes et triggers sont traduites en erreurs métier dans le service, via `onViolation('<trigger ou contrainte>', ...)`.
- `AiProvider` est le port IA abstrait (`AiProviderPort`, adaptateur `anthropicProvider.ts`, `unavailableAi` par défaut) ; `Studio` mène la boucle d’outils de l’AI Studio sur les services existants et ne produit que des propositions, appliquées par le front après confirmation. Lire `docs/decisions/0003-ai-studio.md`.
- `src/server/` : un fichier `*Http.ts` par domaine, handlers d'une ligne. `errors.ts` fournit `httpErrors<DomainError>({...})`, une table exhaustive (vérifiée par le typage) des erreurs métier vers les erreurs HTTP ; seules les violations SQL génériques (UNIQUE, CHECK, FOREIGN KEY) y restent. `AccountsHttp.ts` porte les sessions (lecture par `securityDecode`, pose et effacement par `securitySetCookie` : HttpOnly, SameSite=Lax, Secure en https), le contrôle d'origine et les middlewares. `Http.ts` compose les Layers ; `createApiHandler(port)` permet d'injecter n'importe quel `DatabasePort`.
- `src/server/ReadCache.ts` enveloppe l'API : lectures GET authentifiées mises en cache par utilisateur et par version de résidence (`residence_sync`, incrémentée par triggers sur toute table à `residence_id`) ; `frontend/lib/sync.ts` sonde `/api/sync` toutes les 10 s et relance les `useQuery` affichés quand la version change. Toute nouvelle table de résidence doit avoir ses triggers `sync_*` (voir `docs/decisions/0005-synchronisation-cache.md`).
- `migrations/` : SQL numéroté, appliqué par Wrangler en local et rejoué intégralement par les tests. Les invariants (chevauchement de séjours, archivage, occupant unique, dernier admin) vivent dans des triggers et index ; les mutations et leurs traces d'historique partent en un seul `batch` atomique.
- `test/` : `node --test` sur TypeScript natif. `test/helpers/database.ts` crée un SQLite en mémoire (`node:sqlite`) avec toutes les migrations (paramètre `through` pour tester une migration intermédiaire) ; `api.test.ts` exerce le contrat HTTP via `createApiHandler`.
- `frontend/` : `main.tsx` (thème Astryx, i18n fr-FR), `app/` (cadre, navigation `sections.ts`), `command/` (barre d’actions ⌘K à plugins, voir `docs/decisions/0004-barre-actions.md`), `features/` (une page par domaine), `lib/` (client API, données, presse-papiers).
