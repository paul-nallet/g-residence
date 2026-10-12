import { Building2 } from 'lucide-react'
import { call } from '../../lib/api.ts'
import type { CommandPlugin } from '../types.ts'

export const lotsPlugin: CommandPlugin = {
  id: 'lots',
  title: 'Lots',
  icon: Building2,
  scope: { keywords: ['lots'], placeholder: 'Rechercher un lot par numéro, étage ou type…' },
  isAvailable: (context) => context.canOpen('lots'),
  search: async (q) => {
    const page = await call((client) => client.lots.list({ query: { q } }))
    return page.items.map((lot) => ({
      id: lot.id,
      title: 'Lot ' + lot.number,
      subtitle: [lot.building_name, lot.floor && 'étage ' + lot.floor, lot.type].filter(Boolean).join(' · '),
      icon: Building2,
      actions: [{ kind: 'open', id: 'open', title: 'Ouvrir la fiche', href: '#lots/' + lot.id }],
    }))
  },
}
