import type { ComponentProps, ReactNode } from 'react'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack } from '@astryxdesign/core/Stack'
import { Token } from '@astryxdesign/core/Token'
import { parisDate, parisTime } from '../../src/domain/rules.ts'
import { dateLabel } from './shared.tsx'

export type JournalTag = { label: string; color: ComponentProps<typeof Token>['color'] }
export type JournalEntry = {
  id: string
  body: string
  actor: string
  created_at: string
  tag?: JournalTag
}

const instantLabel = (instant: string) => dateLabel(parisDate(instant)) + ' à ' + parisTime(instant)

export function Journal({
  entries,
  title = 'Journal',
  empty = 'Aucune entrée au journal.',
  action,
}: {
  entries: readonly JournalEntry[]
  title?: string
  empty?: string
  action?: ReactNode
}) {
  return (
    <List
      hasDividers
      header={
        <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
          <Heading level={2}>{title}</Heading>
          {action}
        </HStack>
      }
    >
      {entries.length ? (
        entries.map((entry) => (
          <ListItem
            key={entry.id}
            label={entry.body}
            description={instantLabel(entry.created_at) + ' · ' + entry.actor}
            endContent={entry.tag && <Token label={entry.tag.label} color={entry.tag.color} size="sm" />}
          />
        ))
      ) : (
        <ListItem label={empty} />
      )}
    </List>
  )
}
