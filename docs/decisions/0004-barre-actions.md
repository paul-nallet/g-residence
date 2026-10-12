# 0004 — Barre d’actions

Statut : accepté, 11 octobre 2026.

## Choix

La recherche globale (⌘K) devient une barre d’actions à plugins, inspirée de Raycast, dans `frontend/command/`. Elle s’appuie sur `CommandPalette` d’Astryx : le composant garde le dialogue, la liste et la navigation au clavier ; la barre fournit la source de recherche, l’entrée et le pied.

- `types.ts` : le contrat. Un `CommandPlugin` déclare sa disponibilité (`isAvailable`, d’après le rôle et les rubriques visibles), sa recherche, ses suggestions à vide, ses commandes (`commands`, par exemple « Créer un article », proposées à vide et retrouvées par mots-clés), ses replis (`fallbacks`, proposés dans sa portée quand aucun résultat ne porte exactement le nom cherché) et, s’il en a une, sa portée (`scope` : mots-clés et texte d’aide). Il renvoie des `CommandItem` ; chaque élément porte une liste non vide de `CommandAction`, la première étant l’action principale.
- Quatre sortes d’action : `open` (aller à une rubrique ou une fiche), `push` (ouvrir une vue imbriquée), `form` (formulaire d’une ou plusieurs étapes, un champ par étape : chaque champ décrit la saisie à chaque frappe, peut être facultatif ou prérempli, puis le formulaire est soumis) et `run` (exécuter, renvoyer un message de confirmation).
- `engine.ts` : logique pure, testée dans `test/command.test.ts`. Vue racine, portée par préfixe (« stock cafe »), vues de portée, d’actions et de formulaire. Un plugin en échec n’efface pas les résultats des autres.
- `useCommandBar.ts` : pile de vues. Chaque vue garde sa requête, restaurée au retour. Après une action `run` réussie, la barre revient à la dernière liste et relance la recherche.
- `CommandBar.tsx` : clavier et rendu. Entrée lance l’action principale du résultat surligné, ou du premier ; Tab (ou ⌘K) entre dans une portée ou ouvre les actions ; Échap, Maj+Tab ou Retour arrière sur une saisie vide reviennent en arrière.
- `plugins/` : un fichier par domaine, ordonnés dans `plugins/index.ts` (l’ordre fixe celui des groupes).

Les plugins appellent le client HttpApi typé et les endpoints métier habituels : filtrage côté API, périmètre de résidence et permissions inchangés. La recherche SQL ignore accents et casse (`folded` et `searchPattern` dans `src/services/Database.ts`).

## Ajouter un plugin

Créer `plugins/<domaine>.ts` qui exporte un `CommandPlugin`, puis l’ajouter à `plugins/index.ts`. Une action d’écriture passe par `form` ou `run` et renvoie un message de confirmation en français. Aucune action destructive sans étape de confirmation explicite.

## Limites

Une action réussie déclenche la synchronisation des pages ouvertes (voir `0005-synchronisation-cache.md`). Les résultats de recherche restent limités à 6 par plugin à la racine et à 20 dans une portée.
