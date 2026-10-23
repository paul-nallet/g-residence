# 0009 — Mise en production

Statut : proposé, 23 octobre 2026.

## Choix

- Un seul environnement de production : Worker `gresidence`, base D1 `gresidence-production` déclarée dans `wrangler.jsonc`. Pas d’environnement de préproduction ; la validation reste sur base locale séparée.
- Le déploiement est lancé par Paul depuis son poste, connecté par `wrangler login`. Aucun déploiement depuis une session d’agent ni depuis la CI.
- Plan Workers Paid (5 $/mois) avec alerte de budget : le hachage PBKDF2 de la connexion dépasse les 10 ms de CPU du plan gratuit (décision 0006).
- Traces échantillonnées à 5 % (`head_sampling_rate`), logs conservés à 100 %.
- AI Studio désactivé : `AI_PROVIDER` vide, aucun secret `AI_API_KEY`. Activation après quota par utilisateur et validation de la transmission des données (décisions 0003 et 0006).
- Adresse `*.workers.dev` au départ ; un domaine personnalisé s’ajoute ensuite sans changement de code (cookie `Secure` dès https, contrôle d’origine sur l’hôte de la requête).

## Prérequis

1. Compte Cloudflare en plan Workers Paid, alerte de budget configurée.
2. Base `gresidence-production` existante sur ce compte, identifiant conforme à `wrangler.jsonc` (`npx wrangler d1 list`).
3. `ADMIN_EMAIL` dans `wrangler.jsonc` = adresse du premier administrateur.
4. Tarification « Cloudflare Observability » du 1er décembre 2026 relue.

## Procédure

```bash
rtk npx wrangler login
rtk npm run db:remote:status   # migrations restant à appliquer
rtk npm run deploy             # check, migrations distantes (confirmation), déploiement
```

`deploy` s’arrête si `check` échoue ; les migrations sont appliquées avant le nouveau code, elles doivent donc rester compatibles avec la version précédente.

## Première installation

Immédiatement après le premier déploiement, ouvrir l’adresse publiée et créer le compte administrateur avec `ADMIN_EMAIL`. Tant que ce compte n’existe pas, toute personne qui connaît l’adresse et l’email peut le créer. Si l’écran d’installation n’est plus proposé alors que personne ne l’a fait, restaurer la base vierge par Time Travel (ci-dessous).

## Vérifications

- Connexion, déconnexion, cookie `Secure` et `HttpOnly`.
- Création d’un bâtiment, d’un lot, d’un séjour ; reprise dans le bilan hebdomadaire.
- Invitation d’un gestionnaire et d’un agent de ménage, droits vérifiés sur téléphone.
- Synchronisation entre deux onglets.
- Logs Workers sans erreur, CPU de la connexion sous la limite.

## Retour arrière

- Code : `npx wrangler rollback` revient au déploiement précédent.
- Données : `npx wrangler d1 time-travel restore gresidence-production --timestamp=<horodatage>` (30 jours en plan Paid). Les migrations ne se défont pas : une correction passe par une nouvelle migration.

## Hors périmètre

Préproduction, déploiement automatique, domaine personnalisé, Cloudflare Access, sauvegardes exportées hors Cloudflare, emails et récupération de mot de passe.
