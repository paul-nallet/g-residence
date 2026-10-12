# 0006 — Maîtrise des coûts Cloudflare

Statut : accepté, 12 octobre 2026.

## Constat

Un seul utilisateur pour l’instant. Aucun traitement en arrière-plan : ni Cron, ni Durable Object, ni Queue, ni Workflow, ni `waitUntil`. Les assets statiques ne passent pas par le Worker (`run_worker_first` limité à `/api`) et sont gratuits. Le seul trafic récurrent est le sondage `/api/sync` (décision 0005).

Grilles consultées le 12 octobre 2026 :

| | Workers Free | Workers Paid (5 $/mois) |
| --- | --- | --- |
| Requêtes Worker | 100 000 / jour, coupure au-delà | 10 M / mois inclus, puis 0,30 $ / M |
| CPU par requête | 10 ms | 30 s par défaut |
| D1 lignes lues | 5 M / jour, coupure au-delà | 25 G / mois inclus |
| D1 lignes écrites | 100 000 / jour, coupure au-delà | 50 M / mois inclus |
| Logs Workers | 200 000 événements / jour | 20 M / mois inclus, puis 0,60 $ / M |

La tarification des logs et des traces passe à « Cloudflare Observability » le 1er décembre 2026 : à relire avant tout déploiement.

## Coût du sondage

Le Worker répond à `/api/sync` depuis la requête de contrôle de session de `ReadCache` : une seule requête SQL (session, utilisateur, version), environ trois lignes lues. Le front sonde toutes les 10 s tant que l’onglet est visible et utilisé, toutes les 60 s après 5 minutes sans clic, frappe, défilement ou toucher, et pas du tout quand l’onglet est masqué. Toute interaction après inactivité déclenche une vérification immédiate.

| Usage | Requêtes / jour | Lignes lues / jour |
| --- | --- | --- |
| Un onglet actif 8 h | ~2 900 | ~9 000 |
| Un onglet visible et inactif 24 h | ~1 450 | ~4 300 |
| Un onglet actif 24 h | 8 640 | ~26 000 |

À un utilisateur, le coût est nul. Le plan gratuit tient une dizaine d’onglets actifs en permanence ; le plan Paid une quarantaine sans dépasser l’inclus. Le risque n’est pas le montant mais la coupure du plan gratuit.

## Règles

- Aucun traitement en arrière-plan (Cron, Durable Object, Queue, Workflow, WebSocket, `waitUntil`) sans décision écrite et chiffrée.
- Un seul sondeur côté front, `frontend/lib/sync.ts`. Jamais de `setInterval`, `setTimeout` récurrent ou rechargement périodique dans une page. Pas de sondage onglet masqué, pas d’intervalle inférieur à 10 s.
- Lectures indexées, filtrées et paginées côté API : D1 facture les lignes lues, pas les requêtes.
- Toute nouvelle dépense à l’usage (IA, stockage R2, services tiers) est bornée par utilisateur avant d’être exposée.

## Avant tout déploiement

- Plan Workers Paid : le hachage PBKDF2 à 100 000 itérations de la connexion dépasse probablement les 10 ms de CPU du plan gratuit. Configurer une alerte de budget, ce plan n’ayant plus de coupure.
- Échantillonner les traces (`observability.traces.head_sampling_rate`, 0,05 par exemple) : elles sont aujourd’hui à 100 % et chaque sondage en produit.
- AI Studio : jusqu’à 8 tours de 16 000 tokens de sortie, résultats d’outils de 12 000 caractères renvoyés à chaque tour, sans quota. Ajouter un quota par utilisateur et par jour avant de l’activer en production.
