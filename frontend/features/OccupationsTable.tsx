import { useState, type ReactNode } from 'react'
import { Table, proportional, useTableRowExpansion } from '@astryxdesign/core/Table'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { Notice, Stay } from '../../src/domain/stays.ts'
import { dateLabel, StateToken } from './shared.tsx'

export function OccupationsTable({
  stays,
  notices,
  renderDetails,
}: {
  stays: readonly Stay[]
  notices: readonly Notice[]
  renderDetails: (stay: Stay) => ReactNode
}) {
  const [expandedKeys, setExpandedKeys] = useState(new Set<string>())
  const expansion = useTableRowExpansion<Stay>({
    expandedKeys,
    onToggle: (id) =>
      setExpandedKeys((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    getRowKey: (stay) => stay.id,
    renderExpanded: renderDetails,
  })

  return (
    <Table
      aria-label="Occupations du lot"
      data={[...stays]}
      idKey="id"
      density="balanced"
      dividers="rows"
      hasHover
      plugins={{ expansion }}
      columns={[
        {
          key: 'resident',
          header: 'Résident',
          width: proportional(2),
          renderCell: (stay) => <Text weight="semibold">{stay.first_name + ' ' + stay.last_name}</Text>,
        },
        {
          key: 'status',
          header: 'Statut',
          width: proportional(1),
          renderCell: (stay) => (
            <StateToken
              state={
                stay.cancelled ? 'cancelled' : stay.actual_end ? 'Terminé' : stay.actual_start ? 'occupied' : 'planned'
              }
            />
          ),
        },
        {
          key: 'planned',
          header: 'Dates prévues',
          width: proportional(2),
          renderCell: (stay) => (
            <VStack gap={1}>
              <Text>Entrée : {dateLabel(stay.planned_start)}</Text>
              <Text color="secondary">Sortie : {dateLabel(stay.planned_end ?? '')}</Text>
            </VStack>
          ),
        },
        {
          key: 'actual_start',
          header: 'Entrée réelle',
          width: proportional(1),
          renderCell: (stay) => <Text>{stay.actual_start ? dateLabel(stay.actual_start) : 'Non confirmée'}</Text>,
        },
        {
          key: 'actual_end',
          header: 'Sortie réelle',
          width: proportional(1),
          renderCell: (stay) => <Text>{stay.actual_end ? dateLabel(stay.actual_end) : 'Non confirmée'}</Text>,
        },
        {
          key: 'notice',
          header: 'Préavis',
          width: proportional(2),
          renderCell: (stay) => {
            const notice = notices.find((item) => item.stay_id === stay.id && !item.withdrawn)
            return notice ? (
              <VStack gap={1}>
                <Text>Départ : {dateLabel(notice.departure_on)}</Text>
                <Text color="secondary">Reçu le {dateLabel(notice.received_on)}</Text>
              </VStack>
            ) : (
              <Text color="secondary">Aucun préavis actif</Text>
            )
          },
        },
      ]}
    />
  )
}
