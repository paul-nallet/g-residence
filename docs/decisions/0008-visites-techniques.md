# 0008 — Visites techniques autonomes

Statut : accepté, 12 octobre 2026, à la demande de Paul.

Une visite contrôle un bâtiment sans nécessiter de chantier. Rubrique autonome dans la sidenav. Planification directe possible, ou modèle facultatif créé et modifié sur une page complète, jamais en modale ; checklist ordonnée par zone, fréquence hebdomadaire/mensuelle/trimestrielle/ponctuelle ; mensuelle par défaut. La tournée conserve implicitement les points à reprendre et sa fréquence par bâtiment. Les contrôles spécialisés des équipements ne sont pas couverts par cette cadence opérationnelle.

D1 conserve modèles, snapshots de visites, constats signés et trace des modifications. Une seule visite prévue par modèle. Les constats clos ne se réécrivent pas ; une nouvelle visite corrige l’état observé. Un point non vérifié doit être expliqué et reste distinct d’un point conforme. La création d’un signalement se fait après clôture et reste explicite, avec un lien unique au point.

La prochaine échéance part de la dernière date réelle terminée, avec ajustement à la fin du mois ; avant la première réalisation, elle part de la première échéance saisie. Une annulation ne la repousse pas. Les visites prévues se planifient explicitement ; calendrier du jour et bilan hebdomadaire reprennent les données persistées.

Aucun coût de service nouveau : stockage D1, lectures indexées et pages de 20 éléments, mutations en batch atomique, snapshots bornés à 50 points. Aucun Cron, Queue, Durable Object, Workflow, WebSocket, R2 ou fournisseur externe. Réutilisation du sondeur et de l’invalidation de cache par version de résidence. Aucun déploiement dans cette livraison.
