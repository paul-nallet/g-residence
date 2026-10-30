import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Coffee,
  Droplets,
  Package,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Me } from '../../src/domain/accounts.ts'
import { type Event, OVERDUE_LIMIT } from '../../src/domain/agenda.ts'
import { type CleaningTask, REVIEW_LIMIT } from '../../src/domain/cleaning.ts'
import { addDays, today } from '../../src/domain/rules.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { CommentIcon, taskComments } from './Cleaning.tsx'
import { dateLabel, eventHref, EventStateToken, eventSubject, kindLabels, Loading, StateToken } from './shared.tsx'

type Tone = 'error' | 'warning' | 'info'
type Action = {
  key: string
  tone: Tone
  icon: LucideIcon
  label: string
  description: string
  done: string
  href?: string
  count: number
}

const SHOW_DONE = 'gresidence:overview:done'
const readShowDone = () => {
  try {
    return window.localStorage.getItem(SHOW_DONE) === '1'
  } catch {
    return false
  }
}
const writeShowDone = (value: boolean) => {
  try {
    window.localStorage.setItem(SHOW_DONE, value ? '1' : '0')
  } catch {}
}
const movementKinds: readonly Event['kind'][] = ['entry', 'exit', 'inspection_entry', 'inspection_exit']
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
const longDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(date),
  )
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(month + '-01'))
const lotLabel = (task: CleaningTask) =>
  'Lot ' + task.lot_number + (task.building_name ? ' · ' + task.building_name : '')

export function Overview({ me }: { me: Me }) {
  const date = today(),
    month = date.slice(0, 7),
    manager = me.role !== 'cleaner',
    [showDone, setShowDone] = useState(readShowDone),
    load = useCallback(async () => {
      const [
        lots,
        occupied,
        events,
        overdue,
        cleaning,
        late,
        reviews,
        stock,
        meters,
        metersPending,
        issues,
        works,
        revenue,
      ] = await Promise.all([
        call((client) => client.lots.list({ query: {} })),
        call((client) => client.lots.list({ query: { state: 'occupied' } })),
        call((client) => client.calendar.list({ query: { from: date, to: addDays(date, 6) } })),
        manager ? call((client) => client.calendar.overdue()) : [],
        call((client) => client.cleaning.tasks({ query: { from: date, to: date } })),
        call((client) => client.cleaning.tasks({ query: { from: addDays(date, -7), to: addDays(date, -1) } })),
        manager ? call((client) => client.cleaning.reviews()) : [],
        manager ? call((client) => client.stock.list({ query: { level: 'alert' } })) : null,
        manager ? call((client) => client.meters.list({ query: { month } })) : null,
        manager ? call((client) => client.meters.list({ query: { month, pending: 'true' } })) : null,
        manager ? call((client) => client.technical.issues({ query: { status: 'open' } })) : null,
        manager ? call((client) => client.technical.works({ query: { status: 'active' } })) : null,
        manager ? call((client) => client.revenue.list({ query: { month } })) : null,
      ])
      return {
        lots,
        occupied,
        events,
        overdue,
        cleaning,
        late,
        reviews,
        stock,
        meters,
        metersPending,
        issues,
        works,
        revenue,
      }
    }, [date, month, manager]),
    result = useQuery('overview:' + date, load)

  return (
    <PageLayout
      header={
        <VStack gap={1}>
          <Heading level={1}>Bonjour {me.name}</Heading>
          <Text color="secondary">
            {longDate(date)} · {me.residenceName}
          </Text>
        </VStack>
      }
    >
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        (() => {
          const data = result.data,
            overdue = data.overdue,
            todayEvents = data.events.filter((event) => event.date === date),
            upcoming = data.events.filter((event) => event.date > date && event.status !== 'cancelled'),
            upcomingMovements = upcoming.filter((event) => movementKinds.includes(event.kind)),
            lateCleaning = data.late.filter((task) => task.status === 'planned'),
            cleaningActive = data.cleaning.filter((task) => task.status !== 'cancelled'),
            cleaningLeft = cleaningActive.filter((task) => task.status === 'planned'),
            stockOut = data.stock?.items.filter((item) => item.level === 'out').length ?? 0,
            stockLow = (data.stock?.items.length ?? 0) - stockOut,
            meterCount = data.meters?.total ?? 0,
            meterLeft = data.metersPending?.total ?? 0,
            sourceCount = data.revenue?.total ?? 0,
            sourceLeft = data.revenue?.pending ?? 0,
            candidates: Action[] = [
              ...(manager
                ? [
                    {
                      key: 'overdue',
                      tone: 'error',
                      icon: CalendarClock,
                      label: 'Mouvements à confirmer',
                      description:
                        'Entrées, sorties ou états des lieux passés, toujours marqués comme prévus : voir la liste ci-dessous.',
                      done: 'Aucun mouvement passé à confirmer.',
                      count: overdue.length,
                    } satisfies Action,
                  ]
                : []),
              {
                key: 'late-cleaning',
                tone: 'error',
                icon: ClipboardList,
                label: 'Ménages en retard',
                description: 'Tâches des sept derniers jours restées à faire.',
                done: 'Tous les ménages des sept derniers jours sont traités.',
                href: '#cleaning',
                count: lateCleaning.length,
              },
              ...(cleaningActive.length
                ? [
                    {
                      key: 'cleaning',
                      tone: 'info',
                      icon: ClipboardList,
                      label: manager ? 'Ménages du jour' : 'Mes ménages du jour',
                      description: `${cleaningActive.length - cleaningLeft.length} sur ${cleaningActive.length} réalisés.`,
                      done: `${plural(cleaningActive.length, 'ménage réalisé', 'ménages réalisés')} aujourd’hui.`,
                      href: '#cleaning',
                      count: cleaningLeft.length,
                    } satisfies Action,
                  ]
                : []),
              ...(manager
                ? ([
                    {
                      key: 'reviews',
                      tone: 'warning',
                      icon: ClipboardCheck,
                      label: 'Ménages à valider',
                      description: 'Ménages terminés en attente de votre vérification : dépliez la liste ci-dessous.',
                      done: 'Tous les ménages terminés sont vérifiés.',
                      count: data.reviews.length,
                    },
                    {
                      key: 'issues',
                      tone: 'warning',
                      icon: Wrench,
                      label: 'Signalements ouverts',
                      description: 'Problèmes déclarés en attente de prise en charge.',
                      done: 'Aucun signalement ouvert.',
                      href: '#technical/signalements',
                      count: data.issues?.open ?? 0,
                    },
                    {
                      key: 'stock',
                      tone: stockOut ? 'error' : 'warning',
                      icon: Package,
                      label: 'Stocks à réapprovisionner',
                      description:
                        [
                          stockOut ? `${plural(stockOut, 'article', 'articles')} en rupture` : '',
                          stockLow ? `${plural(stockLow, 'article', 'articles')} sous le seuil d’alerte` : '',
                        ]
                          .filter(Boolean)
                          .join(', ') + '.',
                      done: 'Toutes les quantités dépassent leur seuil d’alerte.',
                      href: '#stock',
                      count: data.stock?.total ?? 0,
                    },
                    {
                      key: 'meters',
                      tone: 'warning',
                      icon: Droplets,
                      label: 'Relevés de compteurs',
                      description: `${meterCount - meterLeft} sur ${meterCount} relevés pour ${monthLabel(month)}.`,
                      done: `${plural(meterCount, 'compteur relevé', 'compteurs relevés')} pour ${monthLabel(month)}.`,
                      href: '#meters',
                      count: meterLeft,
                    },
                    {
                      key: 'revenue',
                      tone: 'info',
                      icon: Coffee,
                      label: 'Chiffre d’affaires des prestations',
                      description: `${sourceCount - sourceLeft} sur ${sourceCount} saisies pour ${monthLabel(month)}.`,
                      done: `${plural(sourceCount, 'prestation saisie', 'prestations saisies')} pour ${monthLabel(month)}.`,
                      href: '#services',
                      count: sourceLeft,
                    },
                  ] satisfies Action[])
                : []),
            ],
            actions = candidates.filter(
              (action) => (action.key !== 'meters' || meterCount > 0) && (action.key !== 'revenue' || sourceCount > 0),
            ),
            pending = actions.filter((action) => action.count > 0),
            completed = actions.filter((action) => action.count === 0),
            shown = showDone ? [...pending, ...completed] : pending

          return (
            <>
              <List
                hasDividers
                header={
                  <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                    <HStack gap={2} vAlign="center">
                      <Heading level={2}>À traiter</Heading>
                      {pending.length > 0 && <Badge label={pending.reduce((sum, action) => sum + action.count, 0)} />}
                    </HStack>
                    <Switch
                      size="sm"
                      label={`Afficher les tâches faites (${completed.length}/${actions.length})`}
                      value={showDone}
                      onChange={(value) => {
                        setShowDone(value)
                        writeShowDone(value)
                      }}
                    />
                  </HStack>
                }
              >
                {shown.map((action) =>
                  action.count > 0 ? (
                    <ListItem
                      key={action.key}
                      startContent={<Icon icon={action.tone === 'error' ? AlertTriangle : action.icon} />}
                      label={action.label}
                      description={action.description}
                      href={action.href}
                      endContent={<Badge variant={action.tone} label={action.count} />}
                    />
                  ) : (
                    <ListItem
                      key={action.key}
                      startContent={<Icon icon={CheckCircle2} color="success" />}
                      label={action.label}
                      description={action.done}
                      href={action.href}
                      endContent={<Token label="Fait" color="green" size="sm" />}
                    />
                  ),
                )}
                {pending.length === 0 && !showDone && (
                  <EmptyState
                    isCompact
                    icon={<Icon icon={CheckCircle2} />}
                    title="Tout est à jour"
                    description={`${plural(completed.length, 'point vérifié', 'points vérifiés')} : rien ne demande votre attention.`}
                  />
                )}
              </List>

              {overdue.length > 0 && (
                <List
                  hasDividers
                  header={
                    <HStack gap={2} vAlign="center">
                      <Heading level={2}>Mouvements en retard</Heading>
                      <Badge
                        variant="error"
                        label={overdue.length >= OVERDUE_LIMIT ? OVERDUE_LIMIT + '+' : overdue.length}
                      />
                    </HStack>
                  }
                >
                  {overdue.map((event) => (
                    <EventItem key={event.id} event={event} withDate />
                  ))}
                </List>
              )}

              {data.reviews.length > 0 && (
                <Collapsible
                  defaultIsOpen={false}
                  chevronPosition="start"
                  trigger={
                    <HStack gap={2} vAlign="center">
                      <Heading level={2}>Ménages à valider</Heading>
                      <Badge
                        variant="warning"
                        label={data.reviews.length >= REVIEW_LIMIT ? REVIEW_LIMIT + '+' : data.reviews.length}
                      />
                    </HStack>
                  }
                >
                  <List hasDividers>
                    {data.reviews.map((task) => (
                      <ListItem
                        key={task.id}
                        startContent={<Icon icon={ClipboardCheck} />}
                        label={lotLabel(task)}
                        description={
                          dateLabel(task.day) +
                          ' · ' +
                          task.agent_name +
                          (task.total ? ' · ' + task.handled + '/' + task.total + ' points' : '')
                        }
                        href={'#cleaning/' + task.id}
                        endContent={
                          <HStack gap={2} vAlign="center">
                            {task.issues > 0 && (
                              <Token label={plural(task.issues, 'anomalie', 'anomalies')} color="orange" size="sm" />
                            )}
                            <CommentIcon comments={taskComments(task)} />
                          </HStack>
                        }
                      />
                    ))}
                  </List>
                </Collapsible>
              )}

              <Grid columns={{ minWidth: 140, max: 4 }} gap={3}>
                <Metric
                  label="Occupation"
                  value={data.lots.total ? Math.round((data.occupied.total / data.lots.total) * 100) + ' %' : '—'}
                  detail={`${data.occupied.total} lots occupés sur ${data.lots.total}`}
                  href="#lots"
                />
                <Metric
                  label="Mouvements à venir"
                  value={String(upcomingMovements.length)}
                  detail="Entrées, sorties et états des lieux sur sept jours"
                  href="#calendar"
                />
                <Metric
                  label="Ménage du jour"
                  value={`${cleaningActive.length - cleaningLeft.length}/${cleaningActive.length}`}
                  detail={cleaningActive.length ? 'Tâches réalisées' : 'Aucune tâche prévue'}
                  href="#cleaning"
                />
                {data.works && (
                  <Metric
                    label="Travaux en cours"
                    value={String(data.works.active)}
                    detail="À planifier, planifiés ou commencés"
                    href="#technical"
                  />
                )}
              </Grid>

              <Grid columns={{ minWidth: 320, max: 2 }} gap={5}>
                <List hasDividers header={<Heading level={2}>Aujourd’hui</Heading>}>
                  {todayEvents.map((event) => (
                    <EventItem key={event.id} event={event} />
                  ))}
                  {data.cleaning.map((task) => (
                    <ListItem
                      key={task.id}
                      startContent={<Icon icon={ClipboardList} />}
                      label={lotLabel(task)}
                      description={
                        'Ménage' +
                        (manager ? ' · ' + task.agent_name : '') +
                        ' · ' +
                        (task.total ? task.handled + '/' + task.total + ' points' : 'Sans checklist')
                      }
                      href={'#cleaning/' + task.id}
                      endContent={
                        <HStack gap={2} vAlign="center">
                          <CommentIcon comments={taskComments(task)} />
                          <StateToken state={task.status} />
                        </HStack>
                      }
                    />
                  ))}
                  {todayEvents.length === 0 && data.cleaning.length === 0 && (
                    <ListItem label="Aucun rendez-vous ni ménage aujourd’hui." />
                  )}
                </List>

                <List
                  hasDividers
                  header={
                    <HStack gap={2} vAlign="center" hAlign="between">
                      <Heading level={2}>Les sept prochains jours</Heading>
                      <Button label="Calendrier" size="sm" variant="ghost" href="#calendar" />
                    </HStack>
                  }
                >
                  {upcoming.slice(0, 8).map((event) => (
                    <EventItem key={event.id} event={event} withDate />
                  ))}
                  {upcoming.length === 0 && <ListItem label="Aucun événement prévu cette semaine." />}
                  {upcoming.length > 8 && (
                    <ListItem label={`Voir les ${upcoming.length} événements`} href="#calendar" />
                  )}
                </List>
              </Grid>
            </>
          )
        })()
      )}
    </PageLayout>
  )
}

function Metric({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <ClickableCard label={`${label} : ${value}, ${detail}`} href={href}>
      <VStack gap={1}>
        <Text type="supporting">{label}</Text>
        <Text type="display-3">{value}</Text>
        <Text type="supporting">{detail}</Text>
      </VStack>
    </ClickableCard>
  )
}

function EventItem({ event, withDate = false }: { event: Event; withDate?: boolean }) {
  const icon = event.kind === 'intervention' ? Wrench : CalendarClock
  return (
    <ListItem
      startContent={<Icon icon={icon} />}
      label={`${event.time ? event.time + ' · ' : ''}${eventSubject(event)}`}
      description={[
        kindLabels[event.kind],
        withDate ? dateLabel(event.date) : '',
        event.resident,
        event.duration ? event.duration + ' min' : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      href={eventHref(event)}
      endContent={<EventStateToken event={event} />}
    />
  )
}
