# 0010 — Ménage hors ligne

Statut : accepté, 30 octobre 2026.

## Besoin

Les agents de ménage travaillent dans des caves, sous-sols et locaux sans réseau. « Ma journée » et la checklist d’une tâche doivent rester utilisables, et rien ne doit se perdre au retour du réseau.

## Choix

- Un service worker (`frontend/public/sw.js`, voir aussi `0011-pwa.md`) garde l’application : page d’accueil en réseau d’abord puis copie locale, fichiers `/assets/*` et polices en cache d’abord (300 entrées au plus). Il n’intercepte jamais `/api`. Les fichiers chargés avant son activation lui sont transmis par la page.
- `GET /api/cleaning/day` renvoie en une requête les tâches du jour de l’agent connecté avec checklist, commentaires et, pour les gestionnaires, sorties de stock. La réponse est gardée dans `localStorage` (quatre jours au plus), ainsi que la dernière session valide pour démarrer sans réseau.
- Chaque action de l’agent (point, tout cocher, commentaire, fin du ménage) passe par une file locale (`frontend/lib/cleaningOffline.ts`), même en ligne : appliquée tout de suite à l’affichage (`cleaningOps.ts`, pur et testé), envoyée dans l’ordre dès que le réseau répond. Seule une erreur de transport arrête l’envoi ; un refus métier est vérifié contre l’état du serveur : déjà appliqué, l’action est soldée, sinon elle est montrée à l’agent.
- Le serveur accepte l’heure réelle (`at`), ramenée à l’heure du serveur si elle est future ou date de plus de sept jours, et un identifiant client pour les commentaires (`ON CONFLICT DO NOTHING`) : un envoi rejoué ne crée pas de doublon.
- La déconnexion efface session et données gardées. Une session expirée garde la file, renvoyée après reconnexion du même compte.

## Coûts

Aucun traitement en arrière-plan, aucun nouveau sondeur : le retour du réseau est détecté par le sondeur de `sync.ts` et l’événement `online`. Le service worker ne fait aucune requête périodique. Une lecture de journée coûte trois requêtes SQL indexées, comme une tâche.

## Limites

Les pages des gestionnaires, le calendrier et les lots ne sont pas disponibles hors ligne. Une tâche jamais ouverte ni présente dans une journée gardée n’est pas consultable sans réseau.
