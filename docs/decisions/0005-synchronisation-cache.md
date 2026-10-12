# 0005 — Synchronisation des pages et cache de lecture

Statut : accepté, 11 octobre 2026.

## Version de résidence

`residence_sync` porte une version par résidence. Des triggers SQL l’incrémentent à chaque insertion, modification ou suppression dans toute table qui a une colonne `residence_id` (migration `0015_sync.sql`), ainsi qu’à chaque modification de `residences`. Aucun service n’a à y penser : toute écriture, quelle que soit son origine, change la version. `test/sync.test.ts` échoue si une nouvelle table de résidence n’a pas ses trois triggers.

`GET /api/sync` renvoie `{ version }`, lisible par tous les rôles.

## Pages à jour

`frontend/lib/sync.ts` tient un sondeur unique partagé par toutes les requêtes `useQuery` affichées : un appel à `/api/sync` toutes les 10 secondes tant que l’onglet est visible, et immédiatement quand il le redevient. La première version sert de référence. Si elle change, chaque `useQuery` monté relance son chargement sans repasser par l’état de chargement. Une écriture réussie (`useMutation`, barre d’actions) déclenche une vérification immédiate.

Le sondage coûte une requête légère par onglet, et les données ne sont relues que lorsque quelque chose a changé.

## Cache de lecture du worker

`src/server/ReadCache.ts` enveloppe le handler de l’API. Pour une requête `GET` authentifiée, hors `/api/auth/*`, une seule requête SQL valide la session et lit la version de la résidence. La clé de cache associe l’utilisateur, la version et l’URL : une écriture change la version et rend aussitôt les entrées précédentes inaccessibles, sans invalidation explicite. Seules les réponses 200 sans `Set-Cookie` sont conservées. L’en-tête `x-cache` indique `hit` ou `miss`, et `Cache-Control: no-store` reste en place pour le navigateur.

`ReadCachePort` est le port. Première implémentation : `memoryReadCache`, en mémoire de l’isolat, 500 entrées au plus (LRU), 60 secondes de durée de vie pour borner les réponses qui dépendent de la date du jour. Un adaptateur partagé entre isolats (Cache API, KV) pourra le remplacer sans toucher au reste.

Une lecture servie depuis le cache coûte une requête SQL au lieu de deux pour la session et de une à dix pour les données. Le sondage de `/api/sync` passe lui-même par le cache.

## Limites

La version est globale à la résidence : une écriture sur le stock relance aussi les requêtes des autres domaines affichés. Des versions par domaine permettraient de cibler, au prix d’une table de correspondance entre tables, domaines et requêtes.
