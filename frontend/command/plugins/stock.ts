import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Package, PackagePlus } from 'lucide-react'
import { MAX_ITEM_CATEGORIES, type MovementKind, type StockItem } from '../../../src/domain/stock.ts'
import { today } from '../../../src/domain/rules.ts'
import { call } from '../../lib/api.ts'
import type { CommandAction, CommandCheck, CommandForm, CommandItem, CommandPlugin, CommandValues } from '../types.ts'

const MAX_QUANTITY = 1_000_000
const amount = (value: number, unit: string) => value.toLocaleString('fr-FR') + (unit ? ' ' + unit : '')
const parseQuantity = (input: string) => (/^\d+$/.test(input) ? Number(input) : null)
const quantityError = (min: number): CommandCheck => ({
  isValid: false,
  text: 'Saisissez un nombre entier entre ' + min + ' et 1 000 000.',
})
const optionalQuantity = (input: string, describe: (quantity: number) => string): CommandCheck => {
  if (!input) return { isValid: true, text: describe(0) + ' Entrée pour passer.' }
  const quantity = parseQuantity(input)
  return quantity === null || quantity > MAX_QUANTITY ? quantityError(0) : { isValid: true, text: describe(quantity) }
}
const tooLong = (label: string, max: number): CommandCheck => ({
  isValid: false,
  text: label + ' : ' + max + ' caractères maximum.',
})
const categoriesOf = (input: string) => [
  ...new Set(
    input
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  ),
]

const movements = {
  in: { title: 'Enregistrer une entrée', icon: ArrowDownToLine, min: 1 },
  out: { title: 'Enregistrer une sortie', icon: ArrowUpFromLine, min: 1 },
  count: { title: 'Mettre à jour le stock', icon: ClipboardCheck, min: 0 },
} satisfies Record<MovementKind, { title: string; icon: typeof Package; min: number }>

const after = (item: StockItem, kind: MovementKind, quantity: number) =>
  kind === 'count' ? quantity : kind === 'in' ? item.quantity + quantity : item.quantity - quantity

const movementForm = (item: StockItem, kind: MovementKind): CommandForm => ({
  fields: [
    {
      id: 'quantity',
      label: kind === 'count' ? 'Quantité comptée' : 'Quantité',
      describe: (input) => {
        const quantity = parseQuantity(input)
        if (quantity === null)
          return {
            isValid: false,
            text: 'En stock : ' + amount(item.quantity, item.unit) + '. Saisissez un nombre entier.',
          }
        const next = after(item, kind, quantity)
        if (quantity < movements[kind].min || quantity > MAX_QUANTITY || next > MAX_QUANTITY)
          return quantityError(movements[kind].min)
        if (next < 0) return { isValid: false, text: 'Stock insuffisant : ' + amount(item.quantity, item.unit) + '.' }
        return { isValid: true, text: amount(item.quantity, item.unit) + ' → ' + amount(next, item.unit) }
      },
    },
  ],
  submit: async (values) => {
    const quantity = parseQuantity(values.quantity ?? '') ?? 0
    await call((client) =>
      client.stock.move({
        params: { id: item.id },
        payload: { kind, quantity, occurred_on: today(), comment: '' },
      }),
    )
    return item.name + ' : ' + amount(after(item, kind, quantity), item.unit) + ' en stock.'
  },
})

const movementAction = (item: StockItem, kind: MovementKind): CommandAction => ({
  kind: 'form',
  id: kind,
  title: movements[kind].title,
  icon: movements[kind].icon,
  form: movementForm(item, kind),
})

const createForm = (values?: CommandValues): CommandForm => ({
  ...(values ? { values } : {}),
  fields: [
    {
      id: 'name',
      label: 'Nom de l’article',
      describe: (input) =>
        !input
          ? { isValid: false, text: 'Nom de l’article : valeur obligatoire.' }
          : input.length > 160
            ? tooLong('Nom de l’article', 160)
            : { isValid: true, text: 'Nom de l’article' },
    },
    {
      id: 'initial',
      label: 'Quantité en stock',
      describe: (input, current) =>
        optionalQuantity(input, (quantity) => (current.name ?? '') + ' : ' + quantity + ' en stock.'),
    },
    {
      id: 'unit',
      label: 'Unité (pièces, rouleaux, lots…)',
      describe: (input) =>
        input.length > 40
          ? tooLong('Unité', 40)
          : { isValid: true, text: input ? 'Unité : ' + input : 'Facultatif : Entrée pour passer.' },
    },
    {
      id: 'threshold',
      label: 'Seuil d’alerte',
      describe: (input) =>
        optionalQuantity(input, (quantity) =>
          quantity ? 'Alerte à ' + quantity + ' ou moins.' : 'Alerte quand le stock est épuisé.',
        ),
    },
    {
      id: 'categories',
      label: 'Catégories, séparées par des virgules',
      describe: (input) => {
        const categories = categoriesOf(input)
        if (categories.length > MAX_ITEM_CATEGORIES)
          return { isValid: false, text: MAX_ITEM_CATEGORIES + ' catégories au plus.' }
        if (categories.some((name) => name.length > 80)) return tooLong('Catégorie', 80)
        return {
          isValid: true,
          text: categories.length ? categories.join(' · ') : 'Facultatif : Entrée pour créer l’article.',
        }
      },
    },
  ],
  submit: async (submitted) => {
    const name = submitted.name ?? '',
      unit = submitted.unit ?? '',
      initial = parseQuantity(submitted.initial ?? '') ?? 0
    await call((client) =>
      client.stock.create({
        payload: {
          name,
          unit,
          initial,
          threshold: parseQuantity(submitted.threshold ?? '') ?? 0,
          categories: categoriesOf(submitted.categories ?? ''),
        },
      }),
    )
    return 'Article « ' + name + ' » créé : ' + amount(initial, unit) + ' en stock.'
  },
})

const createCommand = (name?: string): CommandItem => ({
  id: name === undefined ? 'create' : 'create:' + name,
  title: name === undefined ? 'Créer un article' : 'Créer l’article « ' + name + ' »',
  subtitle: name === undefined ? 'Ajouter une référence au stock' : 'Aucun article ne convient ?',
  keywords: ['ajouter', 'nouvel article', 'nouveau', 'stock', 'référence'],
  icon: PackagePlus,
  actions: [
    {
      kind: 'form',
      id: 'create',
      title: 'Créer un article',
      icon: PackagePlus,
      form: createForm(name === undefined ? undefined : { name }),
    },
  ],
})

const levelLabels = { ok: '', low: 'à réapprovisionner', out: 'épuisé' } satisfies Record<StockItem['level'], string>

const stockItem = (item: StockItem): CommandItem => ({
  id: item.id,
  title: item.name,
  subtitle: [amount(item.quantity, item.unit), levelLabels[item.level]].filter(Boolean).join(' · '),
  icon: Package,
  actions: [
    { kind: 'open', id: 'open', title: 'Ouvrir la fiche', href: '#stock/' + item.id },
    movementAction(item, 'out'),
    movementAction(item, 'in'),
    movementAction(item, 'count'),
  ],
})

export const stockPlugin: CommandPlugin = {
  id: 'stock',
  title: 'Stocks',
  icon: Package,
  scope: { keywords: ['stocks', 'articles'], placeholder: 'Rechercher, ou créer un article…' },
  isAvailable: (context) => context.canOpen('stock'),
  search: async (q) => (await call((client) => client.stock.list({ query: { q } }))).items.map(stockItem),
  commands: () => [createCommand()],
  fallbacks: (query) => [createCommand(query)],
}
