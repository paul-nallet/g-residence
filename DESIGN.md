# Design

## Base retenue

Reprendre la construction Astryx du projet de référence : thème Neutral, navigation latérale, en-tête et zone principale. Adapter les parcours à la résidence étudiante. Le shell provient du template officiel shell-side-nav, avec une navigation latérale sur toute la hauteur et une TopNav au-dessus du contenu uniquement. L’identité et le nom de la résidence sont en tête de navigation latérale ; la barre supérieure porte le fil d’Ariane, la recherche et le menu du compte ; la V1 propose les parcours opérationnels de comptes, lots et mouvements.

## Intentions

Le gestionnaire doit repérer ce qui se passe aujourd'hui et cette semaine, puis accéder au lot ou à l'action concernée. L'agent de ménage doit voir ses tâches du jour et une checklist lisible dans le lot.

Navigation initiale : Vue d'ensemble, Lots et mouvements, Calendrier, Ménage, Technique, Stocks, Relevés, Prestations, Rapports, Équipe. Les domaines hors V1 conservent leurs pages de cadrage, sauf Ménage, Relevés et Stocks désormais opérationnels. Équipe est réservé à l’administrateur ; rapports sont masqués au ménage.

## Règles

- Menu de commandes dans la barre supérieure : recherche des rubriques autorisées au rôle, ouverture par bouton ou ⌘K / Ctrl+K, sélection au clavier et fermeture avec Échap.

- Données opérationnelles en lignes ou tableaux ; éviter une grille de cartes pour chaque lot ou tâche.
- Accès au détail : le nom de l’élément dans le tableau est un lien (`Link`) vers une fiche adressable `#rubrique/<id>`, sans bouton fantôme ni état local. Un seul fil d’Ariane, celui de la barre supérieure : `Résidence / Rubrique / Élément`, alimenté par `useDetailCrumb` depuis la fiche ; aucun fil d’Ariane dans la page et jamais de bouton « Retour ». Le retour du navigateur fonctionne. Les actions secondaires d’une ligne vont dans un `MoreMenu`.
- Calendrier pour les événements datés ; liste quotidienne complémentaire sur mobile.
- Détail du lot : onglets Vue d’ensemble (prochains événements), Occupations (séjours, préavis et états des lieux) et Historique. Les deux derniers sont réservés aux gestionnaires et administrateurs ; les actions du lot restent dans l’en-tête commun. L’équipement reste hors V1.
- Occupations : une ligne de tableau par séjour, avec résident, statut, dates prévues, entrée et sortie réelles et préavis actif. Les lignes se déplient pour retrouver les actions, commentaires, préavis retirés et états des lieux.
- Différencier prévu, réalisé, annulé, manquant et inconnu ; ne pas les coder seulement par une couleur.
- Une checklist d'équipement distingue présence constatée, manquant et non vérifié.
- Copie Excel : colonnes stables et contenu tabulé, libellé de période explicite, confirmation après copie réelle. Aucun transfert automatique vers Excel implicite.
- Export de recettes : source, période, montant, devise et convention HT/TTC explicites.
- Pas de faux chiffres, de rendez-vous inventés ou de boutons de saisie sans action.
- Accessible au clavier, focus visible, icônes nommées, erreurs proches de la saisie, navigation mobile explicite.

## Construction

Respecter les règles Astryx d'AGENTS.md : template avant nouvelle page, composants pour le layout, tokens et props pour les adaptations. Le thème Neutral démarre en mode sombre. Le sélecteur de la barre supérieure propose Clair, Sombre et Système ; le choix est mémorisé dans ce navigateur. Système suit les préférences du système d’exploitation.

Le cadre AppShell utilise la variante section, sans l’arrondi du panneau élevé. La navigation latérale conserve un fond secondaire neutre via le token de fond body du thème, en clair comme en sombre. Elle démarre à 240 px, avec l’identité GResidence en tête, sans titre de gestion ni compte en pied ; le nom et le rôle figurent dans le menu du compte en haut à droite. Les pages exploitent la largeur disponible avec un retrait Astryx de 4. PageLayout sépare l’en-tête fixe du contenu défilant et propose un emplacement de navigation secondaire. La fiche du lot affiche un fil d’Ariane au-dessus du titre.

## Validation

La réussite du build ne prouve pas l'ergonomie. Le parcours création du lot, séjour, entrée réelle, préavis, état des lieux et copie du bilan a été vérifié dans le navigateur. Les vues semaine/mois, écran compact et actions au clavier ont également été exercées. L’adoption du design reste ouverte aux retours de Paul.

## Relevés des communs

Page issue du template Astryx blank et intégrée au cadre PageLayout existant. Liste paginée des compteurs avec emplacement, référence, fluide, unité, dernier index daté et état du mois suivi. Navigation entre mois, accès direct à la saisie et à l’historique. Formulaires en dialogue, saisie décimale française acceptée et confirmation après enregistrement. Historique en tableau paginé, avec correction. Les libellés précisent « index » et « date de constat ». La fiche d’un compteur ouvre sur le récapitulatif annuel : navigation par année, total calculé, graphique en barres SVG aux couleurs du thème (libellé accessible détaillé) et tableau mensuel avec la période de calcul ou la raison d’une valeur absente.

Validation des relevés : ajout de compteur, index avec virgule décimale, état mensuel, consultation de l’historique et correction exercés dans le navigateur sur une résidence de validation séparée. Formulaire contrôlé à 390 px ; tableaux à défilement horizontal sur écran étroit. Vérifications complètes du projet réussies.

## Ménage

Onglets Planning et Fiches pour les gestionnaires ; l’agent n’a que son planning. Planning en vue jour ou semaine (jour par défaut pour l’agent), une liste par jour comportant des tâches, chaque ligne menant à la fiche adressable `#cleaning/<id>` : lot, agent, fiche, avancement, consigne, état et anomalies en Token. Planification en dialogue avec choix multiple des lots et aperçu de la fiche appliquée à chacun.

Fiche de tâche : consigne, barre d’avancement, listes « À faire » et « À vérifier ». Une case à cocher par point ; « Non fait » ou « Signaler une anomalie » dans le menu de la ligne, avec constat. Cocher une case n’affiche pas de message qui décalerait la liste, l’état visible suffit. Le bouton Terminer reste désactivé tant qu’un point n’est pas traité, avec l’explication en infobulle. Les fiches modèles s’ouvrent sur `#cleaning/fiches/<id>` et s’éditent en dialogue : points ordonnés, fiche par défaut et lots rattachés.

Validation : création de fiche, planification de deux lots, consultation par l’agent, cases cochées, anomalie avec constat, fin du ménage et lecture seule après réalisation, exercés dans le navigateur sur une base locale séparée, y compris à 375 px.

