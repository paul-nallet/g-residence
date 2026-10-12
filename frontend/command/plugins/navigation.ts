import { sections } from '../../app/sections.ts'
import { matches } from '../engine.ts'
import type { CommandContext, CommandItem, CommandPlugin } from '../types.ts'

const sectionItem = (section: (typeof sections)[number]): CommandItem => ({
  id: section.id,
  title: section.label,
  subtitle: section.description,
  icon: section.icon,
  actions: [{ kind: 'open', id: 'open', title: 'Ouvrir la rubrique', href: '#' + section.id }],
})
const visible = (context: CommandContext) => sections.filter((section) => context.canOpen(section.id))

export const navigationPlugin: CommandPlugin = {
  id: 'navigation',
  title: 'Rubriques',
  icon: 'menu',
  isAvailable: () => true,
  search: (query, context) =>
    visible(context)
      .filter((section) => matches(query, section.label, section.id))
      .map(sectionItem),
  suggestions: (context) => visible(context).map(sectionItem),
}
