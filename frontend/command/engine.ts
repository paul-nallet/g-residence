import type {
  CommandAction,
  CommandCheck,
  CommandContext,
  CommandField,
  CommandForm,
  CommandItem,
  CommandPlugin,
  CommandValues,
  CommandView,
} from './types.ts'

export const RESULTS_PER_PLUGIN = 6
export const RESULTS_IN_SCOPE = 20
const MIN_SCOPE_PREFIX = 3

export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export const matches = (query: string, ...texts: readonly string[]) => {
  const haystack = fold(texts.join(' '))
  return fold(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word))
}

export const resolveScope = (query: string, plugins: readonly CommandPlugin[]) => {
  const [first = '', ...rest] = query.trim().split(/\s+/)
  const prefix = fold(first)
  if (prefix.length < MIN_SCOPE_PREFIX) return null
  const plugin = plugins.find((candidate) =>
    candidate.scope?.keywords.some((keyword) => fold(keyword).startsWith(prefix)),
  )
  return plugin ? { plugin, rest: rest.join(' ') } : null
}

const commandsOf = (plugin: CommandPlugin, query: string, context: CommandContext) =>
  (plugin.commands?.(context) ?? []).filter((command) => matches(query, command.title, ...(command.keywords ?? [])))

const pluginItems = async (plugin: CommandPlugin, query: string, context: CommandContext, inScope: boolean) => {
  const search = async () =>
    (await plugin.search(query, context)).slice(0, inScope ? RESULTS_IN_SCOPE : RESULTS_PER_PLUGIN)
  const results = inScope ? await search() : await search().catch((): readonly CommandItem[] => [])
  const term = query.trim()
  const isExact = results.some((result) => fold(result.title) === fold(term))
  const fallbacks = inScope && term && !isExact ? (plugin.fallbacks?.(term, context) ?? []) : []
  return [...commandsOf(plugin, query, context), ...results, ...fallbacks]
}

export const scopeView = (plugin: CommandPlugin, context: CommandContext): CommandView => ({
  id: 'scope:' + plugin.id,
  kind: 'list',
  title: plugin.title,
  icon: plugin.icon,
  placeholder: plugin.scope?.placeholder ?? 'Rechercher…',
  search: async (query) => [{ title: plugin.title, items: await pluginItems(plugin, query, context, true) }],
})

export const scopeItem = (plugin: CommandPlugin, context: CommandContext): CommandItem => ({
  id: 'scope:' + plugin.id,
  title: plugin.title,
  subtitle: plugin.scope?.placeholder,
  icon: plugin.icon,
  actions: [{ kind: 'push', id: 'scope', title: 'Rechercher', view: scopeView(plugin, context) }],
})

export const rootView = (plugins: readonly CommandPlugin[], context: CommandContext): CommandView => {
  const available = plugins.filter((plugin) => plugin.isAvailable(context))
  const scopable = available.filter((plugin) => plugin.scope)
  return {
    id: 'root',
    kind: 'list',
    title: 'Recherche',
    icon: 'search',
    placeholder: 'Rechercher une rubrique, un lot, un article, une commande…',
    search: async (query) => {
      if (!query.trim())
        return [
          { title: 'Rechercher dans', items: scopable.map((plugin) => scopeItem(plugin, context)) },
          { title: 'Commandes', items: available.flatMap((plugin) => plugin.commands?.(context) ?? []) },
          ...available.flatMap((plugin) =>
            plugin.suggestions ? [{ title: plugin.title, items: plugin.suggestions(context) }] : [],
          ),
        ].filter((group) => group.items.length > 0)
      const scope = resolveScope(query, scopable)
      if (scope) {
        const items = await pluginItems(scope.plugin, scope.rest, context, true)
        return [
          {
            title: scope.plugin.title,
            items: scope.rest ? items : [scopeItem(scope.plugin, context), ...items],
          },
        ]
      }
      const results = await Promise.all(available.map((plugin) => pluginItems(plugin, query, context, false)))
      return available
        .map((plugin, index) => ({ title: plugin.title, items: results[index] ?? [] }))
        .filter((group) => group.items.length > 0)
    },
  }
}

const actionItem = (item: CommandItem, action: CommandAction): CommandItem => ({
  id: action.id,
  title: action.title,
  icon: action.icon ?? item.icon,
  actions: [expand(item, action)],
})

export const actionsView = (item: CommandItem): CommandView => ({
  id: 'actions:' + item.id,
  kind: 'actions',
  title: item.title,
  icon: item.icon,
  placeholder: 'Choisir une action…',
  search: (query) => [
    {
      title: 'Actions',
      items: item.actions.filter((action) => matches(query, action.title)).map((action) => actionItem(item, action)),
    },
  ],
})

const checkField = (field: CommandField, input: string, values: CommandValues): CommandCheck =>
  field.describe?.(input, values) ??
  (input
    ? { isValid: true, text: field.label }
    : field.isOptional
      ? { isValid: true, text: 'Facultatif : Entrée pour passer.' }
      : { isValid: false, text: field.label + ' : valeur obligatoire.' })

const firstMissing = (form: CommandForm) => {
  const index = form.fields.findIndex((field) => form.values?.[field.id] === undefined)
  return index < 0 ? form.fields.length - 1 : index
}

export const formView = (
  item: CommandItem,
  action: CommandAction,
  form: CommandForm,
  index = firstMissing(form),
  values: CommandValues = form.values ?? {},
): CommandView => {
  const field = form.fields[index] ?? form.fields[0]
  const isLast = index >= form.fields.length - 1
  const icon = action.icon ?? item.icon
  return {
    id: 'form:' + item.id + ':' + action.id + ':' + field.id,
    kind: 'form',
    title: action.title,
    icon,
    placeholder: field.label,
    search: (query) => {
      const input = query.trim()
      const { isValid, text } = checkField(field, input, values)
      const next = { ...values, [field.id]: input }
      const step: CommandAction = !isValid
        ? { kind: 'run', id: 'invalid', title: 'Valider', run: () => Promise.reject(new Error(text)) }
        : isLast
          ? { kind: 'run', id: 'submit', title: 'Valider', run: () => form.submit(next) }
          : { kind: 'push', id: 'next', title: 'Suivant', view: formView(item, action, form, index + 1, next) }
      const counter = form.fields.length > 1 ? ' (' + (index + 1) + '/' + form.fields.length + ')' : ''
      return [
        {
          title: item.title + ' · ' + action.title + counter,
          items: [
            {
              id: field.id,
              title: isValid ? step.title + (input ? ' : ' + input : '') : field.label,
              subtitle: text,
              icon,
              actions: [step],
            },
          ],
        },
      ]
    },
  }
}

export const secondaryView = (item: CommandItem): CommandView | null => {
  const [primary] = item.actions
  if (primary.kind === 'push') return primary.view
  return item.actions.length > 1 ? actionsView(item) : null
}

export type CommandStep = Exclude<CommandAction, { kind: 'form' }>
export const expand = (item: CommandItem, action: CommandAction): CommandStep =>
  action.kind === 'form'
    ? {
        kind: 'push',
        id: action.id,
        title: action.title,
        icon: action.icon ?? item.icon,
        view: formView(item, action, action.form),
      }
    : action
