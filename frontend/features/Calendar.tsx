import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Popover } from '@astryxdesign/core/Popover'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { Event } from '../../src/domain/agenda.ts'
import { addDays, monday, today, monthLast, shiftMonth } from '../../src/domain/rules.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { useHashParam } from '../lib/hashParams.ts'
import { DateField, dateLabel, EventList, eventHref, eventSubject, Loading, StateToken } from './shared.tsx'

const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(new Date(date))
const kindTokens = {
  entry: { label: 'Entrée', color: 'green' },
  exit: { label: 'Départ', color: 'orange' },
  inspection_entry: { label: 'EDL entrée', color: 'purple' },
  inspection_exit: { label: 'EDL sortie', color: 'purple' },
  intervention: { label: 'Intervention', color: 'blue' },
} as const
const weekdays = Array.from({ length: 7 }, (_, index) => addDays('2026-01-05', index))
const MONTH_VISIBLE = 3
const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))

function periodLabel(view: string, date: string, from: string, to: string) {
  if (view === 'month') return format(date, { month: 'long', year: 'numeric' })
  if (view === 'day') return format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `${format(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function MonthPicker({ label, date, select }: { label: string; date: string; select: (month: string) => void }) {
  const [isOpen, setOpen] = useState(false),
    [year, setYear] = useState(Number(date.slice(0, 4)))
  return (
    <Popover
      label="Choisir le mois et l’année"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) setYear(Number(date.slice(0, 4)))
        setOpen(open)
      }}
      content={
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <IconButton
              label="Année précédente"
              icon={<Icon icon="chevronLeft" />}
              variant="ghost"
              size="sm"
              onClick={() => setYear(year - 1)}
            />
            <Text type="label">{year}</Text>
            <IconButton
              label="Année suivante"
              icon={<Icon icon="chevronRight" />}
              variant="ghost"
              size="sm"
              onClick={() => setYear(year + 1)}
            />
          </HStack>
          <Grid columns={3} gap={1}>
            {months.map((month) => {
              const value = `${year}-${month}`
              return (
                <Button
                  key={month}
                  label={format(value + '-01', { month: 'short' })}
                  tooltip={format(value + '-01', { month: 'long', year: 'numeric' })}
                  variant={date.startsWith(value) ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    select(value)
                    setOpen(false)
                  }}
                />
              )
            })}
          </Grid>
        </VStack>
      }
    >
      <Button label={label} variant="ghost" size="lg" endContent={<Icon icon="chevronDown" />} />
    </Popover>
  )
}

function DayCell({
  day,
  events,
  isToday,
  isOutside,
  compact,
  open,
}: {
  day: string
  events: readonly Event[]
  isToday: boolean
  isOutside: boolean
  compact: boolean
  open: () => void
}) {
  const visible = compact ? events.slice(0, MONTH_VISIBLE) : events,
    hidden = events.length - visible.length
  return (
    <Card
      padding={2}
      minHeight={compact ? 140 : 320}
      variant={isToday ? 'blue' : isOutside ? 'muted' : 'default'}
      elevation={isToday ? 'low' : 'none'}
    >
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label={format(
              day,
              compact && day.endsWith('-01') ? { day: 'numeric', month: 'short' } : { day: 'numeric' },
            )}
            tooltip={'Voir le ' + format(day, { weekday: 'long', day: 'numeric', month: 'long' })}
            variant={isToday ? 'primary' : 'ghost'}
            size="sm"
            onClick={open}
          />
          {isToday && <Badge variant="info" label="Aujourd’hui" />}
          {events.length > 0 && !isToday && <Badge label={String(events.length)} />}
        </HStack>
        {visible.length > 0 && (
          <List density="compact">
            {visible.map((event) => (
              <ListItem
                key={event.id}
                href={eventHref(event)}
                label={`${eventSubject(event)}${event.time ? ' · ' + event.time : ''}`}
                description={
                  <VStack gap={1}>
                    <HStack gap={1} wrap="wrap">
                      <Token label={kindTokens[event.kind].label} color={kindTokens[event.kind].color} size="sm" />
                      {event.status !== 'planned' && <StateToken state={event.status} />}
                    </HStack>
                    {!compact && event.resident && (
                      <Text type="supporting" maxLines={2}>
                        {event.resident}
                      </Text>
                    )}
                  </VStack>
                }
              />
            ))}
          </List>
        )}
        {hidden > 0 && (
          <Button label={`+ ${hidden} autre${hidden > 1 ? 's' : ''}`} variant="ghost" size="sm" onClick={open} />
        )}
      </VStack>
    </Card>
  )
}

export function Calendar() {
  const [date, setDate] = useHashParam('date', today()),
    [view, setView] = useHashParam('vue', 'week'),
    narrow = useMediaQuery('(max-width: 900px)'),
    current = today()
  const monthStart = date.slice(0, 7) + '-01',
    last = monthLast(monthStart)
  const from = view === 'month' ? monday(monthStart) : view === 'week' ? monday(date) : date,
    to = view === 'month' ? addDays(monday(last), 6) : view === 'week' ? addDays(from, 6) : date
  const load = useCallback(() => call((client) => client.calendar.list({ query: { from, to } })), [from, to]),
    result = useQuery('calendar:' + from + ':' + to, load)
  const dates = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, index) =>
    addDays(from, index),
  )
  const step = (direction: number) => {
    if (view === 'month') setDate(shiftMonth(date, direction))
    else setDate(addDays(date, direction * (view === 'week' ? 7 : 1)))
  }
  const openDay = (day: string) => {
    setDate(day)
    setView('day')
  }
  const eventsOf = (day: string) => result.data!.filter((event) => event.date === day)
  return (
    <PageLayout
      header={
        <VStack gap={2}>
          <Heading level={1}>Calendrier</Heading>
          <Text color="secondary">Entrées, départs, états des lieux et interventions · heure de Paris.</Text>
        </VStack>
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Button label="Aujourd’hui" onClick={() => setDate(current)} />
          <IconButton
            label="Période précédente"
            icon={<Icon icon="chevronLeft" />}
            variant="ghost"
            onClick={() => step(-1)}
          />
          <IconButton
            label="Période suivante"
            icon={<Icon icon="chevronRight" />}
            variant="ghost"
            onClick={() => step(1)}
          />
          <MonthPicker
            label={periodLabel(view, date, from, to)}
            date={date}
            select={(month) => setDate(current.startsWith(month) ? current : month + '-01')}
          />
        </HStack>
        <HStack gap={2} wrap="wrap" vAlign="end">
          <DateField
            label="Aller au"
            value={date}
            onChange={(value) => {
              if (value) setDate(value)
            }}
          />
          <SegmentedControl label="Vue" value={view} onChange={setView}>
            <SegmentedControlItem value="day" label="Jour" />
            <SegmentedControlItem value="week" label="Semaine" />
            <SegmentedControlItem value="month" label="Mois" />
          </SegmentedControl>
          <Button label="Actualiser" variant="ghost" onClick={() => void result.refresh()} />
        </HStack>
      </HStack>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : narrow || view === 'day' ? (
        <VStack gap={4}>
          {!result.data.length && <Text>Aucun événement sur cette période.</Text>}
          {dates
            .filter((day) => view === 'day' || eventsOf(day).length > 0)
            .map((day) => (
              <EventList
                key={day}
                events={eventsOf(day)}
                title={(day === current ? 'Aujourd’hui · ' : '') + dateLabel(day)}
              />
            ))}
        </VStack>
      ) : (
        <VStack gap={2}>
          <Grid columns={7} gap={2}>
            {weekdays.map((day) => (
              <Text key={day} type="label" color="secondary">
                {format(day, { weekday: 'short' })}
              </Text>
            ))}
          </Grid>
          <Grid columns={7} gap={2}>
            {dates.map((day) => (
              <DayCell
                key={day}
                day={day}
                events={eventsOf(day)}
                isToday={day === current}
                isOutside={view === 'month' && day.slice(0, 7) !== date.slice(0, 7)}
                compact={view === 'month'}
                open={() => openDay(day)}
              />
            ))}
          </Grid>
        </VStack>
      )}
    </PageLayout>
  )
}
