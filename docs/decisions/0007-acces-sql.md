# 0007 — Accès SQL : port maison plutôt qu’`effect/sql`

Statut : proposé, 12 octobre 2026.

## Contexte

La refonte Effect du 9 octobre a laissé ouverte l’adoption d’`effect/sql` à la place du port `Database` et du service `Sql` (`src/services/Database.ts`). Les adaptateurs existent désormais : `@effect/sql-d1` pour le Worker et `@effect/sql-sqlite-node` (sur `node:sqlite`) pour les tests, tous deux publiés le 10 octobre 2026 en 4.0.3 et exigeant `effect` ^4.0.3.

## Constat

- L’atomicité repose sur les batches D1 : chaque mutation part avec ses traces d’historique en un seul `batch`. `D1Client.batch` existe, mais les transactions `SqlClient` sont refusées par le pilote D1, et `SqliteClient` n’a pas de `batch`. Il faudrait donc garder un port maison pour le batch, implémenté différemment en production et en test.
- Les violations de contraintes et de triggers sont reconnues par leur message (`onViolation`). Ce comportement doit rester identique d’un pilote à l’autre.
- Les requêtes sont construites dynamiquement (filtres, `folded`, `searchPattern`). Les passer en gabarits `sql\`…\`` toucherait environ 3 000 lignes de services sans changer le comportement.
- Les gains réels se limitent aux spans de traçage et au cache de requêtes préparées. Aucun traceur n’est configuré aujourd’hui.

## Choix

Garder le port `Database` (`all`, `first`, `batch`) et le service `Sql` avec `SqlError` typée. Le contrat est déjà en Effect côté services, testé sur SQLite en mémoire, et ne dépend d’aucun paquet instable.

## Si le traçage devient nécessaire

Adopter `effect/sql` derrière le port, sans toucher aux services : `Sql` exécute chaque `Statement` par `SqlClient.unsafe(sql, values)` ; `batch` passe par `D1Client.batch` en production et par `withTransaction` de `SqliteClient` dans les tests. `createApiHandler` reçoit alors une Layer plutôt qu’un `DatabasePort`, et `ReadCache` lit la session par le même service. Attendre que les adaptateurs aient quelques versions de recul.
