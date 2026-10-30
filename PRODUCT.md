# Gestionnaire de résidence étudiante

Statut : V1 approuvée et implémentée le 9 octobre 2026, étendue jusqu’au 12 octobre 2026 (relevés, stocks, prestations, ménage, technique, boîte à idées, barre d’actions et AI Studio). GResidence est le nom technique provisoire du projet.

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

Bilan lundi-dimanche, en Europe/Paris : entrées et sorties réelles, états des lieux réalisés, préavis reçus actifs, ménages réalisés avec leurs points signalés, signalements constatés, débuts et fins réels des travaux, notes et problèmes du journal, interventions réalisées, mouvements de stock, index constatés, saisies et corrections de chiffre d’affaires, retours de la boîte à idées et créations/corrections/archivages de lots. Les administrateurs voient aussi les comptes créés. Le calendrier est couvert par ses événements réalisés ; la vue d’ensemble et la barre d’actions ne créent pas d’événements supplémentaires. Équipement et AI Studio sont en préparation et ne produisent pas d’activité dans le bilan.

Réalisations et constats à leur date métier ; journal, retours, comptes et modifications de lots à leur date d’enregistrement. Les prestations sont datées par la saisie ou correction, avec le mois concerné et le montant HT ou TTC : aucun chiffre d’affaires hebdomadaire n’est déduit d’une saisie mensuelle. Les événements seulement prévus, annulés et préavis retirés sont exclus. Chaque génération reflète les corrections et réouvertures ; les saisies de prestations conservent leur trace historique. Les changements de statut automatiques du journal technique ne doublonnent pas les débuts et fins réels.

Tableau paginé côté API, copie de toute la semaine avec en-têtes Date, Module, Lot, Objet / lieu, Type d’événement, Intervenant, Nom, Prénom, Commentaire. Copie tabulée protégée contre les formules et commentaires multilignes aplatis. Les modifications de permissions et invitations ne disposent pas actuellement d’un historique daté et ne sont pas reconstruites depuis l’état actuel de l’équipe.

## Périmètre livré

| Domaine | État | Détail |
| --- | --- | --- |
| Comptes | Livré | Rôles administrateur, gestionnaire et ménage ; invitations par lien. |
| Lots et mouvements | Livré | Bâtiments, lots, séjours, préavis, états des lieux, historique. |
| Calendrier | Livré | États des lieux et interventions techniques, semaine, mois et jour ; tâches de ménage de l’agent connecté. |
| Reporting | Livré | Bilan hebdomadaire transversal, tableau paginé et copie Excel complète. |
| Relevés | Livré | Compteurs des communs, index mensuels, récapitulatif annuel. |
| Stock | Livré | Articles, catégories, vues, mouvements et alertes de stock faible. |
| Prestations | Livré | Sources saisies TTC avec taux de TVA ou HT sans taux, saisie mensuelle, récapitulatif annuel HT, TTC et TVA, copie Excel. |
| Ménage | Livré | Fiches modèles, planning par agent, checklist et réalisation. |
| Technique et signalements | Livré | Lieux, fournisseurs, signalements, travaux, journal, interventions et visites techniques. |
| Boîte à idées | Livré | Idées, demandes de fonctionnalités et bugs signés, filtrables par nature. |
| Équipement | Spécifié | Standards par type de logement, constats aux états des lieux ou en inventaire libre, besoins rapprochés du stock (voir « Équipement des lots »). |

Outils transverses : barre d’actions ⌘K (recherche et actions rapides par domaine), synchronisation automatique des pages ouvertes, AI Studio en préparation (désactivé sans fournisseur configuré, voir `docs/decisions/0003-ai-studio.md`).

## Suite à préciser

- Passerelles entre domaines : anomalie de ménage vers signalement, checklist vers stock, récurrence du planning.
- Usage de l’AI Studio hors local : validation de la transmission des données au fournisseur.

Hors périmètre actuel : import Excel, portail résident, documents signés, photos, devis et factures, notifications et emails automatiques, récupération de mot de passe en libre-service, plusieurs résidences.

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

Récapitulatif annuel : une ligne par source, une colonne par mois, totaux par ligne et par mois ; un mois sans saisie reste vide et compte pour zéro dans les totaux. Copie tabulée pour Excel avec montants au format français et protection contre les formules, comme le bilan hebdomadaire.

Décision du 12 octobre 2026 : chaque source a une nature de saisie. Par défaut, elle est « TTC avec taux » : les montants sont saisis TTC, tels qu’encaissés, avec un taux de TVA choisi parmi 0 %, 2,1 %, 5,5 %, 10 % et 20 % (20 % par défaut). Une source peut aussi être « HT sans taux » : les montants sont relevés directement HT, sans TVA calculée. Nature et taux se modifient avec trace avant/après.

Nature et taux sont figés sur chaque saisie au moment de l’enregistrement : modifier la source ne réécrit pas les mois passés, une correction de saisie reprend les valeurs courantes. Pour une saisie TTC, HT et TVA sont calculés côté serveur en centimes, HT arrondi au centime le plus proche et TVA = TTC − HT. Pour une saisie HT, TVA et TTC restent vides.

Suivi mensuel et historique affichent chaque montant avec sa nature (TTC ou HT). Le récapitulatif annuel et la copie Excel donnent un total HT sur toutes les sources ; les totaux TTC et TVA ne portent que sur les sources TTC et l’indiquent. Les saisies existantes deviennent TTC avec le taux par défaut de leur source.

## Équipement des lots

Décision du 12 octobre 2026 : définir l’équipement attendu dans chaque lot meublé, le constater et rapprocher les manquants du stock. Administrateurs et gestionnaires uniquement, dans la résidence autorisée ; l’agent de ménage n’y a pas accès.

Standards : un standard a un nom unique sans distinction de casse et une liste ordonnée d’éléments, chacun avec un libellé, une quantité attendue entière et positive et, facultativement, un article de stock correspondant. Un standard s’associe à un ou plusieurs types de logement (valeur du champ type du lot, sans distinction de casse) ; un type n’a qu’un standard. Un seul standard par défaut couvre les lots dont le type n’a pas de standard. Modifier un standard ne change pas les constats passés.

Constats : un constat porte sur un lot, une date civile non future, un auteur et un commentaire facultatif. Il part de l’état des lieux d’entrée ou de sortie du séjour, ou d’un inventaire libre lancé depuis la fiche du lot. À sa création, les éléments du standard applicable sont copiés avec leur quantité attendue ; on peut ajouter un élément propre au lot. Pour chaque élément on saisit la quantité constatée et un état : conforme, manquant (quantité inférieure à l’attendu) ou abîmé, avec remarque facultative. Un constat se termine quand chaque élément est traité ; un constat terminé n’est plus modifiable, une erreur se rattrape par un nouveau constat.

Fiche du lot : le dernier constat terminé donne l’état d’équipement du lot (complet, manquants, abîmés) et l’historique des constats reste consultable. Un état des lieux réalisé sans constat ne bloque rien.

Besoins des lots : la liste regroupe, pour le dernier constat terminé de chaque lot non archivé, les éléments manquants ou abîmés avec la quantité à fournir. Rien n’est retiré du stock automatiquement : depuis un besoin relié à un article, un gestionnaire enregistre une sortie de stock (même règle qu’une sortie manuelle, avec le lot en commentaire) et marque l’élément fourni ; le lot redevient complet au constat suivant ou quand tous ses besoins sont fournis. Un besoin sans article se marque fourni à la main. Filtres par bâtiment et par article, pagination côté API.

Hors périmètre : photos, signature du résident, facturation des manquants au résident et création de signalement depuis un élément abîmé.

## Ménage

Extension demandée le 9 octobre 2026 : planifier le ménage d’un agent, lui affecter des lots, lui faire cocher une liste de tâches à faire et de points à vérifier dans chaque lot, et le laisser marquer le ménage comme terminé.

Fiches modèles réservées aux administrateurs et gestionnaires : nom unique, points ordonnés de type « à faire » ou « à vérifier ». Une seule fiche par défaut, appliquée à tous les lots sans fiche spécifique ; un lot peut recevoir une fiche spécifique. À la planification, la checklist de la fiche est copiée dans la tâche : modifier ou supprimer une fiche ne change pas les tâches existantes. On peut aussi choisir une autre fiche ou aucune checklist, et ajouter ou retirer un point sur une tâche précise.

Une tâche relie un lot actif, un agent (membre actif de l’équipe, quel que soit son rôle) et un jour civil, avec une consigne facultative. Plusieurs lots peuvent être planifiés en une fois ; un lot n’a qu’une tâche non annulée par jour. États prévu, réalisé et annulé ; seule une tâche prévue se modifie. Chaque point est à faire, fait (ou conforme) ou signalé non fait (ou en anomalie) avec un constat facultatif, avec auteur et heure. Terminer exige que chaque point soit traité, enregistre auteur, heure et commentaire. Les gestionnaires peuvent annuler, rouvrir ou rétablir une tâche.

Révision du 30 octobre 2026 : planification et modification en masse. Le planning gestionnaire coche des tâches prévues (par ligne, par jour ou toute la période) pour les réaffecter, changer leur jour, leur priorité, leur ajouter des points ou les annuler en une fois ; les tâches terminées ou annulées sont ignorées et comptées. La planification propose les sorties et entrées du jour et les lots par bâtiment, montre la checklist réellement appliquée à chaque lot et ignore, en les nommant, les lots déjà planifiés ce jour-là. L’agent proposé par défaut est un compte Ménage : le dernier choisi sur cet appareil, sinon le premier ; sans compte Ménage, le champ reste à choisir et un avertissement l’indique. La checklist d’une tâche prévue se modifie en place (libellés, ordre, ajout, retrait) ; un point qui change de section repart à faire. Une checklist peut être enregistrée comme fiche et une fiche dupliquée.

Révision du 30 octobre 2026 : suivi et vérification. Sur toute tâche non annulée, l’agent comme le gestionnaire ajoutent à tout moment un commentaire, sans changer la checklist ni le statut : un ménage commencé un jour et repris le lendemain garde ainsi la trace de ce qui reste à faire. Les commentaires sont datés, signés, conservés et affichés dans l’ordre sur la tâche. Une tâche terminée est « à vérifier » pour les gestionnaires, qui la valident (commentaire facultatif) ou demandent une reprise : commentaire obligatoire, jour de reprise (aujourd’hui par défaut) et points à refaire facultatifs, remis à faire. La tâche repasse alors prévue chez son agent, marquée « à reprendre » avec le commentaire, et redevient à vérifier quand il la termine de nouveau. Un ménage validé ne se révise plus ; le rouvrir efface la validation. Validations et reprises figurent au bilan hebdomadaire. La vue d’ensemble des gestionnaires liste les ménages terminés à valider, du plus récent au plus ancien (cinquante au plus), quelle que soit leur date ; le planning se filtre par vérification : à vérifier, validés ou à reprendre.

L’agent de ménage ne voit que ses propres tâches dans « Ma journée » : ses lots prévus dans l’ordre de passage, le prochain mis en avant, puis les lots terminés. Chaque point se coche par deux boutons visibles (fait ou conforme, non fait ou anomalie), « Tout marquer fait » et « Tout marquer conforme » traitent les points restants d’une section, et après « Terminer » l’agent passe au lot suivant de sa journée. Ses tâches non annulées apparaissent aussi dans son calendrier. Il ne gère ni les fiches ni le planning. Les gestionnaires voient le planning par jour ou semaine, filtrable par agent. Les ménages réalisés figurent au bilan hebdomadaire des gestionnaires, avec leur commentaire et leurs points signalés. Hors périmètre : rattachement automatique au stock, création de signalement technique depuis une anomalie et récurrence automatique du planning.


## Technique : lieux, fournisseurs, signalements et travaux

Extension demandée le 11 octobre 2026 : rendre concret le suivi technique. Administrateurs et gestionnaires uniquement, dans la résidence autorisée ; l’agent de ménage ne voit pas la rubrique ni les interventions au calendrier.

Lieux : tout lot non archivé est directement un lieu, sans saisie supplémentaire. On crée en plus des lieux libres pour les parties communes ou techniques (Hall, Chaufferie, Toiture…) : nom unique sans distinction de casse, bâtiment et description facultatifs. Un lieu libre se renomme et s’archive ; il n’est jamais supprimé, pour garder l’historique des travaux.

Fournisseurs : les prestataires qui interviennent. Nom unique sans distinction de casse, métiers en texte libre (Plomberie, Électricité…), contact, téléphone, email et notes facultatifs. Archivable, jamais supprimé ; un fournisseur archivé n’est plus proposé mais reste visible sur les travaux passés.

Signalements : une anomalie constatée (capot manquant, trace au mur…), avec titre, description facultative, date de constat non future et zéro ou un lieu (lot ou lieu libre). Sans lieu, le signalement concerne les parties communes en général. États ouvert, résolu et classé sans suite. Un signalement ouvert peut donner naissance à des travaux : il y reste lié et reprend son lieu.

Travaux : titre, description facultative, un ou plusieurs lieux et zéro, un ou plusieurs fournisseurs (un chantier « à planifier » peut ne pas encore en avoir). Statuts à planifier, planifié, en cours, terminé et annulé. Dates prévues de début et de fin facultatives, fin après début. Passer en cours enregistre la date réelle de début, terminer la date réelle de fin ; ces dates ne sont pas dans le futur. Un chantier terminé ou annulé peut être rouvert.

Journal : chaque chantier garde un fil daté et signé, jamais effacé. On y ajoute des notes d’avancement ou des problèmes rencontrés ; chaque changement de statut y est inscrit automatiquement. Les modifications du chantier sont tracées avant/après côté serveur.

Interventions : rendez-vous techniques rattachés à un chantier, avec date et heure (Europe/Paris, heures ambiguës ou inexistantes rejetées), durée, fournisseur facultatif parmi ceux du chantier, état prévu, réalisé ou annulé et compte rendu. Elles apparaissent au calendrier des gestionnaires et dans les prochains rendez-vous des lots concernés.

Listes filtrables par statut et recherche, paginées côté API ; les travaux non terminés et les signalements ouverts sont listés en premier. Signalements, débuts et fins réels, notes et problèmes et interventions réalisées figurent au bilan hebdomadaire. Hors périmètre : photos, documents, devis et factures, montants et notifications.

## Visites techniques des bâtiments

Extension demandée le 12 octobre 2026 : rubrique autonome « Visites techniques » dans la sidenav, distincte de Technique. Administrateurs et gestionnaires uniquement, dans la résidence autorisée. Création directe possible, ou utilisation d’un modèle facultatif. Les modèles se créent et se modifient sur une page complète, jamais dans une modale.

Planification directe : bâtiment obligatoire, titre, jour prévu, fréquence hebdomadaire, mensuelle (par défaut), trimestrielle ou ponctuelle, puis points à contrôler. Une liste de départ de six observations visuelles est proposée (accès, éclairage, sols et murs, encombrement, fuites ou humidité, dégradations), personnalisable par zone, de 1 à 50 points. Elle ne constitue pas une checklist de conformité réglementaire. Le titre identifie une tournée dans un bâtiment ; les visites suivantes peuvent reprendre les mêmes points. Une seule visite prévue par tournée ; elle peut être reportée ou annulée. Chaque visite conserve ses points, son titre, son bâtiment et sa fréquence d’origine.

La page « Modèles » permet de préparer, modifier et archiver les checklists réutilisables par bâtiment ; nom unique par bâtiment, ordre des points, lieu facultatif, fréquence et première échéance. Le bâtiment d’un modèle ne se modifie pas. Toute modification conserve les visites déjà créées. Une planification directe crée ou met à jour la tournée du même titre dans ce bâtiment.

La vue « Échéances » indique la fréquence modifiable, la dernière visite réalisée et la prochaine échéance, avec action pour planifier la prochaine en reprenant les points. La prochaine échéance part de la dernière date réelle de visite terminée : 7 jours, 1 mois ou 3 mois, en ramenant le jour au dernier jour du mois si nécessaire. Avant la première réalisation, le jour de la première visite reste la référence. Une annulation ne repousse pas l’échéance. Une tournée ponctuelle n’a pas d’échéance récurrente. Aucun rendez-vous créé automatiquement, aucune tâche de fond ni notification.

Visite au calendrier en événement du jour, sans heure inventée. Chaque point reçoit un constat : à vérifier, conforme, anomalie ou non vérifié, avec auteur et heure ; anomalie et non vérifié exigent une explication. Terminer exige que chaque point soit traité et enregistre une date réelle non future, un auteur et un compte rendu facultatif. Visites terminées ou annulées en lecture seule.

Après réalisation, une anomalie peut créer explicitement un signalement lié ; une seule création par point, datée du constat réel, avec zone et bâtiment dans la description. Le signalement conserve le parcours existant vers les travaux. Historique des visites avec recherche, filtres bâtiment et statut, pagination côté API. Compte rendu complet copiable pour Excel avec protection contre les formules ; visites réalisées, anomalies et points non vérifiés repris dans le bilan hebdomadaire. Modifications et liens tracés côté serveur. Synchronisation par le sondeur existant.

Hors périmètre : photos, signature, documents PDF, notifications, génération automatique des rendez-vous et contrôles réglementaires spécialisés des équipements.

## Boîte à idées

Ajout du 11 octobre 2026 : chaque membre de l’équipe peut déposer une idée, une demande de fonctionnalité ou un bug, en 2 000 caractères au plus. Chaque entrée est signée et datée, sans modification ni suppression. La liste est filtrable par nature, paginée côté API et bornée à la résidence.

## Priorités opérationnelles

Ajout du 12 octobre 2026 : signalements, travaux et tâches de ménage ont une priorité Basse, Normale, Haute ou Urgente. Normale est la valeur par défaut, y compris pour les données existantes. Haute désigne un problème gênant à traiter rapidement ; Urgente une sécurité ou un service essentiel compromis. La priorité est choisie par le gestionnaire, distincte du statut, des dates prévues et des alertes de retard.

Les travaux créés depuis un signalement reprennent sa priorité, ajustable à la création puis indépendamment. Les listes et chaque colonne du tableau de travaux sont filtrables par priorité et triées de la plus urgente à la plus basse, avec les éléments actifs avant les clos. Les changements de priorité technique sont tracés avant/après.

Au ménage, la priorité porte sur chaque tâche, pas sur la fiche modèle ni ses points. Une planification de plusieurs lots applique le choix à toutes les tâches créées. Le gestionnaire peut la modifier tant que la tâche est prévue ; l’agent la consulte et peut filtrer son planning. Le planning affiche les jours du plus récent au plus ancien, puis place les tâches prévues avant les terminées et les annulées, avec les priorités les plus hautes en premier dans chaque groupe. Un report conserve la priorité. Les droits et le périmètre de résidence restent appliqués aux filtres et aux modifications.
