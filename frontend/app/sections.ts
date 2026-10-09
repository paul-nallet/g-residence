import {
  Building2,
  CalendarDays,
  ClipboardList,
  Coffee,
  Droplets,
  Home,
  Package,
  Users,
  Wrench,
  FileSpreadsheet,
} from 'lucide-react'

export const sections = [
  {
    id: 'overview',
    label: 'Vue d’ensemble',
    icon: Home,
    description: 'Le quotidien de la résidence, au même endroit.',
    items: [
      ['Organiser les mouvements', 'Lots, préavis et états des lieux d’entrée et de sortie.'],
      ['Suivre les opérations', 'Ménage, équipements, interventions, stocks et relevés des communs.'],
      ['Rendre compte', 'Bilan hebdomadaire pour Excel et historique mensuel des prestations.'],
    ],
  },
  {
    id: 'lots',
    label: 'Lots et mouvements',
    icon: Building2,
    description: 'Le lot conserve son histoire, même lorsque son occupant change.',
    items: [
      ['Lots', 'Identifier les appartements et consulter leur suivi.'],
      ['Entrées et sorties', 'Saisir un préavis et organiser les états des lieux.'],
      ['Équipement', 'Retrouver le standard de mobilier et les éléments manquants de chaque lot.'],
    ],
  },
  {
    id: 'calendar',
    label: 'Calendrier',
    icon: CalendarDays,
    description: 'Les rendez-vous et mouvements de la résidence.',
    items: [
      ['États des lieux', 'Visualiser les rendez-vous d’entrée et de sortie.'],
      ['Rendez-vous techniques', 'Consulter les interventions planifiées.'],
      ['Jour et semaine', 'Distinguer les événements prévus, réalisés et annulés.'],
    ],
  },
  {
    id: 'cleaning',
    label: 'Ménage',
    icon: ClipboardList,
    description: 'Un planning simple pour la personne chargée de l’entretien.',
    items: [
      ['Planning', 'Affecter les tâches du jour et de la semaine à un agent, puis à plusieurs si nécessaire.'],
      ['Checklist du lot', 'Constater la présence des accessoires et signaler les manquants.'],
      ['Réalisation', 'Cocher les tâches effectuées et retrouver leur historique.'],
    ],
  },
  {
    id: 'technical',
    label: 'Technique',
    icon: Wrench,
    description: 'Des anomalies au suivi des interventions et des travaux.',
    items: [
      ['Signalements', 'Décrire un problème dans un lot ou dans les parties communes.'],
      ['Interventions', 'Enregistrer les rendez-vous techniques et ce qui a été réalisé.'],
      ['Travaux', 'Suivre les actions et les problèmes rencontrés.'],
    ],
  },
  {
    id: 'stock',
    label: 'Stocks',
    icon: Package,
    description: 'La réserve d’équipements et de consommables de la résidence.',
    items: [
      ['Articles', 'Couettes, tabourets, brosses à toilettes et toute référence créée librement.'],
      ['Mouvements', 'Tracer les entrées, les sorties et les inventaires.'],
      ['Besoins des lots', 'Rapprocher les manquants constatés des équipements à fournir.'],
    ],
  },
  {
    id: 'meters',
    label: 'Relevés',
    icon: Droplets,
    description: 'Les actions mensuelles dans les parties communes.',
    items: [
      ['Compteurs', 'Identifier les compteurs d’eau, d’électricité et de gaz.'],
      ['Relevés mensuels', 'Saisir une valeur avec sa date de constat.'],
      ['Historique', 'Retrouver les relevés précédents sans confondre index et consommation.'],
    ],
  },
  {
    id: 'services',
    label: 'Prestations',
    icon: Coffee,
    description: 'Le chiffre d’affaires des services proposés dans la résidence.',
    items: [
      ['Sources', 'Configurer café, snacks, laverie, impressions et autres prestations.'],
      ['Saisie mensuelle', 'Enregistrer le chiffre d’affaires de chaque source.'],
      ['Historique et export', 'Consulter les périodes précédentes et préparer un export pour Excel.'],
    ],
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: FileSpreadsheet,
    description: 'Un bilan de la semaine prêt à reporter dans Excel.',
    items: [
      ['Période', 'Choisir la semaine concernée.'],
      ['Activité', 'Rassembler les mouvements, tâches, interventions et autres événements réalisés.'],
      ['Copie Excel', 'Copier des colonnes stables, avec des tabulations adaptées au collage.'],
    ],
  },
  {
    id: 'team',
    label: 'Équipe',
    icon: Users,
    description: 'Les personnes qui interviennent dans la résidence.',
    items: [
      ['Comptes', 'Prévoir la connexion et les accès utilisateurs.'],
      ['Agent de ménage', 'Démarrer avec une personne tout en permettant d’en ajouter ensuite.'],
      ['Permissions', 'Préciser la visibilité et les actions autorisées avant la V1.'],
    ],
  },
] as const
