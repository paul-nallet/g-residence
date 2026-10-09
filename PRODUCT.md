# Gestionnaire de résidence étudiante

Statut : V1 approuvée et implémentée le 9 octobre 2026. GResidence est le nom technique provisoire du projet.

## Objectif

Aider l'équipe à organiser les mouvements des résidents, l'entretien des appartements meublés et des communs, les interventions et les relevés, puis à rendre compte de l'activité sans ressaisie inutile.

## Besoins exprimés

| Domaine | Besoin |
| --- | --- |
| Comptes | Comptes utilisateurs et accès adaptés aux personnes intervenant dans la résidence. |
| Lots | Appartements, identification et suivi ; équipement meublé selon un standard commun. |
| Mouvements | Préavis, états des lieux d'entrée et de sortie, rendez-vous et vue calendrier. |
| Reporting | Bilan de tout ce qui s'est passé dans une semaine, prêt à copier-coller dans Excel. |
| Technique | Rendez-vous techniques, problèmes rencontrés, interventions et suivi de travaux. |
| Ménage | Planning du jour et de la semaine, un agent au départ, plusieurs possibles ensuite, tâches à cocher. |
| Équipement | Checklist par lot : présence des accessoires, manquants et éléments à ajouter. |
| Stock | Réserve commune, produits d'hygiène, brosses à toilettes, couverts et autres articles. |
| Relevés | Actions mensuelles : compteurs d'eau, d'électricité et de gaz des parties communes. |
| Signalements | Capot manquant, trace au mur et autres anomalies ; avec ou sans rattachement à un lot. |
| Prestations | Sources configurables : café, snacks, laverie, impressions ; saisie mensuelle du chiffre d'affaires, historique et export Excel. |

## Vocabulaire de travail

- Résidence : périmètre opérationnel et futur périmètre d'accès aux données.
- Bâtiment : regroupement de lots appartenant à une seule résidence.
- Lot : appartement ; distinct de son occupant et des séjours successifs.
- Séjour : occupation d'un lot, avec entrée, préavis éventuel et sortie.
- Rendez-vous : événement planifié ; sa réalisation est une information distincte.
- Tâche de ménage : travail affecté à un agent, avec un jour prévu et une réalisation.
- Standard d'équipement : liste de référence réutilisable, distincte de la checklist constatée dans chaque lot.
- Article : référence de stock ; mouvement de stock : entrée, sortie ou ajustement traçable.
- Signalement : anomalie dans un lot ou les communs ; peut entraîner une intervention.
- Intervention : rendez-vous et suivi technique ; les travaux peuvent regrouper plusieurs interventions.
- Relevé : valeur d'un compteur et date de constat ; distinct de la consommation calculée.
- Source de prestation : activité génératrice de recettes ; saisie de chiffre d'affaires par source et mois.

## Relations à préserver

Un lot conserve son historique lors d'un changement de résident. Un préavis ne réalise pas automatiquement la sortie. Une tâche cochée ne modifie pas automatiquement le stock. Une anomalie peut être située dans les communs sans lot. Le planning distingue prévu, réalisé et annulé. Le bilan hebdomadaire doit distinguer événements prévus et événements réellement réalisés.

Les montants futurs seront stockés en centimes entiers avec une devise, les périodes mensuelles sous une forme explicite `AAAA-MM`. Les rendez-vous auront un instant et un fuseau ; les jours de planning et les dates de préavis resteront des dates civiles. Le fuseau de départ envisagé est Europe/Paris.

## V1 livrée

Une seule résidence. Administrateur pour les comptes, gestionnaires pour les opérations, ménage en lecture seule des lots et mouvements sans noms, commentaires ni rapports. Invitations par lien, sans email automatique.

Une résidence peut contenir plusieurs bâtiments, ajoutés par les administrateurs et gestionnaires, avec un nom unique dans la résidence. Chaque lot doit obligatoirement être rattaché à exactement un bâtiment de sa résidence. Il faut créer un bâtiment avant le premier lot. Le rattachement peut être corrigé, mais jamais retiré. La liste des lots se filtre par bâtiment. Les lots antérieurs sont rattachés au Bâtiment A, conformément à la décision de Paul.

Lots à numéro unique dans la résidence, étage et type facultatifs. Un résident par séjour, identifié uniquement par nom et prénom. Séjours successifs sans chevauchement ; dates prévues et confirmations réelles distinctes. Une occupation réelle reste active jusqu’à confirmation de sortie, même si sa date prévue est passée.

Préavis avec réception et départ prévu, sans calcul automatique de délai. Correction et retrait tracés. États des lieux d’entrée ou de sortie avec date, heure, durée et commentaire ; états prévu, réalisé ou annulé. Réaliser un état des lieux ne confirme pas le mouvement. Archivage des lots et historique des modifications.

Calendrier semaine/mois et liste quotidienne compacte, fuseau Europe/Paris. Les dates de séjour et préavis sont civiles. Les heures de rendez-vous inexistantes ou ambiguës lors du changement d’heure sont rejetées.

Bilan lundi-dimanche : entrées réelles, sorties réelles, états des lieux réalisés et préavis reçus actifs. Les événements prévus, annulés et préavis retirés sont exclus. Chaque génération reflète les corrections. Colonnes Date, Lot, Type d’événement, Nom, Prénom, Commentaire. Copie tabulée avec en-têtes et protection contre les formules ; commentaires multilignes aplatis pour préserver une ligne Excel par événement.

## Suite à préciser

Standard d’équipement et nature HT/TTC des recettes restent à définir. Hors V1 : import Excel, portail résident, documents signés, photos, checklists, technique, stocks et recettes. Récupération de mot de passe en libre-service reportée.

## Relevés des communs

Extension demandée le 9 octobre 2026 : identifier les compteurs d’eau, d’électricité et de gaz des parties communes, saisir un index avec sa date de constat et retrouver les relevés précédents.

Administrateurs et gestionnaires uniquement, dans la résidence autorisée. Chaque compteur a un nom unique, un emplacement, une référence facultative et une unité explicite : m³ pour l’eau, kWh pour l’électricité, m³ ou kWh selon l’affichage du compteur de gaz. Pas de rattachement à un lot.

Le suivi mensuel indique si au moins un relevé existe dans le mois choisi. Plusieurs constats dans un mois sont possibles, mais un seul à une même date par compteur. Index positif ou nul, décimal accepté, date civile réelle non future. Le dernier index est celui de la date de constat la plus récente, indépendamment de l’ordre de saisie. Historique trié par date décroissante et paginé côté API. Correction possible depuis l’historique, avec auteur et trace des valeurs avant/après conservée côté serveur.

Les valeurs sont des index cumulés affichés sur le compteur, jamais des consommations mensuelles. Aucune conversion du gaz, estimation, photo, facture ou export ajouté à ce périmètre. Un index inférieur au précédent reste saisissable, notamment après remplacement d’un compteur ; aucune consommation négative n’en est déduite.

Extension demandée le 9 octobre 2026 : récapitulatif annuel des consommations mois par mois, par compteur, en graphique en barres. La consommation d’un mois est le dernier index constaté dans le mois moins le dernier index constaté avant le mois. Pas de valeur sans relevé dans le mois, sans index antérieur, ou si un index baisse sur la période ; ces mois sont exclus du total annuel. Aucune estimation ni répartition au prorata des jours.

## Stocks

Extension demandée le 9 octobre 2026 : gérer la réserve d’articles en tout genre (couettes, tabourets, brosses à toilettes…), créés librement, remettre le stock à jour et mettre en avant les stocks faibles.

Administrateurs et gestionnaires uniquement, dans la résidence autorisée. Un article a un nom unique, une unité libre facultative, un seuil d’alerte et zéro, une ou plusieurs catégories, par exemple Stock commun et Stock Coworking. Une catégorie regroupe des articles ; elle se choisit dans la liste ou se crée à la saisie, sans distinction de casse. Un article garde une seule quantité, quelles que soient ses catégories. Quantités entières, positives ou nulles.

Trois mouvements tracés avec date civile non future, commentaire, auteur et stock après mouvement : entrée, sortie et inventaire. L’inventaire saisit la quantité comptée et enregistre l’écart. Une sortie ne peut pas dépasser le stock disponible. Aucun mouvement n’est supprimé ni corrigé : une erreur se rattrape par un inventaire. Un article peut être supprimé définitivement après confirmation, avec tout son historique.

Un article est en rupture à zéro et en stock faible lorsque sa quantité atteint son seuil. Ces articles sont signalés, comptés et listés en premier ; un filtre n’affiche qu’eux. Recherche par nom ou catégorie, filtre par catégorie, qui borne aussi le décompte des articles à réapprovisionner, et pagination côté API. Seules les catégories portant au moins un article sont proposées.

Vues : une vue a un nom unique et regroupe une ou plusieurs catégories, par exemple Coworking = Stock Coworking + Linge ; elle affiche les articles appartenant à au moins une d’entre elles, huit vues au maximum. Une vue regroupe des articles de la même réserve, sans quantité propre. Elle s’affiche en onglet de la page Stocks avec son décompte d’articles à réapprovisionner, a sa propre adresse et borne le tableau, la bannière et le filtre de catégorie. Un article ajouté depuis une vue à une seule catégorie reçoit cette catégorie d’office. Supprimer une vue ne touche ni aux articles ni aux catégories.

## Prestations

Extension demandée le 9 octobre 2026, sur le modèle des relevés des communs : configurer les sources de prestation (café, snacks, laverie, impressions…), saisir leur chiffre d’affaires mois par mois, retrouver l’historique et l’exporter vers Excel.

Administrateurs et gestionnaires uniquement, dans la résidence autorisée. Une source a un nom unique sans distinction de casse et une description facultative ; elle se renomme sans perdre son historique. Pas de suppression ni de rattachement à un lot.

Une seule saisie par source et par mois `AAAA-MM`, mois non futur. Montant en centimes entiers, positif ou nul, en euros, avec commentaire facultatif. Le suivi mensuel indique les sources à saisir et le total du mois. Historique par source trié par mois décroissant et paginé côté API. Correction possible depuis l’historique, y compris du mois, avec auteur et trace des valeurs avant/après conservée côté serveur. Les modifications de source sont tracées de la même manière.

Récapitulatif annuel : une ligne par source, une colonne par mois, totaux par ligne et par mois ; un mois sans saisie reste vide et compte pour zéro dans les totaux. Copie tabulée pour Excel avec montants au format français et protection contre les formules, comme le bilan hebdomadaire. La nature HT ou TTC des montants reste à préciser.

## Ménage

Extension demandée le 9 octobre 2026 : planifier le ménage d’un agent, lui affecter des lots, lui faire cocher une liste de tâches à faire et de points à vérifier dans chaque lot, et le laisser marquer le ménage comme terminé.

Fiches modèles réservées aux administrateurs et gestionnaires : nom unique, points ordonnés de type « à faire » ou « à vérifier ». Une seule fiche par défaut, appliquée à tous les lots sans fiche spécifique ; un lot peut recevoir une fiche spécifique. À la planification, la checklist de la fiche est copiée dans la tâche : modifier ou supprimer une fiche ne change pas les tâches existantes. On peut aussi choisir une autre fiche ou aucune checklist, et ajouter ou retirer un point sur une tâche précise.

Une tâche relie un lot actif, un agent (membre actif de l’équipe, quel que soit son rôle) et un jour civil, avec une consigne facultative. Plusieurs lots peuvent être planifiés en une fois ; un lot n’a qu’une tâche non annulée par jour. États prévu, réalisé et annulé ; seule une tâche prévue se modifie. Chaque point est à faire, fait (ou conforme) ou signalé non fait (ou en anomalie) avec un constat facultatif, avec auteur et heure. Terminer exige que chaque point soit traité, enregistre auteur, heure et commentaire. Les gestionnaires peuvent annuler, rouvrir ou rétablir une tâche.

L’agent de ménage ne voit que ses propres tâches, en vue jour par défaut, et ne gère ni les fiches ni le planning. Les gestionnaires voient le planning par jour ou semaine, filtrable par agent. Hors périmètre : rattachement automatique au stock, création de signalement technique depuis une anomalie, récurrence automatique du planning et intégration au bilan hebdomadaire.

