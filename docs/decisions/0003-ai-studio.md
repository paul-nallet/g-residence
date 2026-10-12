# 0003 — AI Studio

Statut : proposé, 11 octobre 2026.

## Choix

Un panneau latéral de conversation, ouvert depuis la barre supérieure, pour questionner l’état de la résidence et préparer des micro-actions.

`AiProviderPort` est le port abstrait : un échange (`system`, tours, outils décrits en JSON Schema) produit un texte et des appels d’outils. Le champ `raw` permet à un adaptateur de rejouer son propre format (blocs de réflexion compris). Premier adaptateur : Anthropic (`@anthropic-ai/sdk`, `claude-opus-5-5` par défaut, repli serveur activé). Sans configuration, `unavailableAi` rend le studio inactif et l’API répond 503.

Le service `Studio` mène la boucle d’outils (huit tours au plus). Les outils de lecture appellent les services existants sous l’utilisateur courant : périmètre de résidence et permissions inchangés, un refus est rendu au modèle comme résultat d’erreur. Les schémas d’outils dérivent des schémas Effect du domaine.

## Garde-fous

Le modèle ne modifie rien. Les outils `proposer_*` valident l’entrée et la cible, puis renvoient une proposition typée ; le front l’applique par l’endpoint métier habituel, après clic de l’utilisateur. La conversation n’est pas stockée : l’historique est renvoyé par le client à chaque message, borné à 40 messages.

Les données lues par les outils sont transmises au fournisseur configuré : à valider avant tout usage hors local.
