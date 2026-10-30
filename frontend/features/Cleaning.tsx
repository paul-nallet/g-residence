import type { Priority } from '../../src/domain/priority.ts'
import { PriorityField, PriorityFilter, PriorityToken, type PriorityFilterValue } from './priority.tsx'
import { type ClipboardEvent, useCallback, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import {
  Table,
  TableSelectionToolbar,
  proportional,
  useTablePagination,
  useTableSelection,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Check, MessageSquareText, Plus, Trash2, X } from 'lucide-react'
import type {
  CleaningItem,
  CleaningItemKind,
  CleaningItemState,
  CleaningOptions,
  CleaningTask,
  CleaningTemplate,
} from '../../src/domain/cleaning.ts'
import type { Me } from '../../src/domain/accounts.ts'
import { addDays, monday, today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call, messageOf } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { useHashParam } from '../lib/hashParams.ts'
import { checkForChanges } from '../lib/sync.ts'
import { useMobile } from '../lib/useMobile.ts'
import { DateField, dateLabel, Editor, Feedback, Loading, PeriodNav, roleLabels, StateToken } from './shared.tsx'

const kinds = ['task', 'check'] as const
const kindTitles: Record<CleaningItemKind, string> = { task: 'À faire', check: 'À vérifier' }
const stateLabels: Record<CleaningItemKind, Record<CleaningItemState, string>> = {
  task: { todo: 'À faire', done: 'Fait', issue: 'Non fait' },
  check: { todo: 'À vérifier', done: 'Conforme', issue: 'Anomalie' },
}
const examples: Record<CleaningItemKind, string> = { task: 'Aspirer les sols', check: 'Ampoules fonctionnelles' }
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(date),
  )
const timeLabel = (instant: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))
const lotLabel = (lot: { number: string; building_name: string }) =>
  'Lot ' + lot.number + (lot.building_name ? ' · ' + lot.building_name : '')
const taskLot = (task: CleaningTask) => lotLabel({ number: task.lot_number, building_name: task.building_name })
const plural = (count: number, one: string, many: string) => count + ' ' + (count > 1 ? many : one)
const pointsSummary = (items: readonly { kind: CleaningItemKind }[]) => {
  const tasks = items.filter((item) => item.kind === 'task').length
  return plural(tasks, 'tâche', 'tâches') + ' · ' + plural(items.length - tasks, 'vérification', 'vérifications')
}
const loadOptions = () => call((client) => client.cleaning.options())
const noOptions = () => Promise.resolve(null)

const agentKey = 'cleaning-agent'
const rememberedAgent = () => {
  try {
    return localStorage.getItem(agentKey) ?? ''
  } catch {
    return ''
  }
}
const rememberAgent = (id: string) => {
  try {
    localStorage.setItem(agentKey, id)
  } catch {
    return
  }
}
const defaultAgent = (agents: CleaningOptions['agents'], ...preferred: string[]) => {
  const cleaners = agents.filter((agent) => agent.role === 'cleaner')
  return preferred.find((id) => cleaners.some((agent) => agent.id === id)) ?? cleaners[0]?.id ?? ''
}

function CleaningTabs({ current }: { current: 'planning' | 'templates' }) {
  return (
    <TabList value={current} onChange={() => undefined}>
      <Tab value="planning" label="Planning" href="#cleaning" />
      <Tab value="templates" label="Fiches" href="#cleaning/fiches" />
    </TabList>
  )
}

const agentOption = (agent: CleaningOptions['agents'][number]) => ({
  value: agent.id,
  label: agent.name,
  description: roleLabels[agent.role],
})
function AgentField({
  agents,
  value,
  onChange,
}: {
  agents: CleaningOptions['agents']
  value: string
  onChange: (value: string) => void
}) {
  const cleaners = agents.filter((agent) => agent.role === 'cleaner'),
    others = agents.filter((agent) => agent.role !== 'cleaner')
  return (
    <VStack gap={2}>
      <Selector
        label="Agent"
        value={value}
        onChange={onChange}
        placeholder="Choisir un agent"
        presentation="adaptive"
        options={[
          ...(cleaners.length
            ? [{ type: 'section' as const, title: 'Agents de ménage', options: cleaners.map(agentOption) }]
            : []),
          ...(others.length
            ? [{ type: 'section' as const, title: 'Autres membres', options: others.map(agentOption) }]
            : []),
        ]}
      />
      {!cleaners.length && (
        <Banner
          status="warning"
          title="Aucun agent de ménage"
          description="Invitez un compte de rôle Ménage depuis Équipe, ou choisissez un autre membre."
        />
      )}
    </VStack>
  )
}

type Row = { key: string; id?: string; kind: CleaningItemKind; label: string }
const newRow = (kind: CleaningItemKind, label = ''): Row => ({ key: crypto.randomUUID(), kind, label })
const rowsOf = (items: readonly { id?: string; kind: CleaningItemKind; label: string }[]): Row[] =>
  items.map((item) => ({ ...item, key: crypto.randomUUID() }))
const pointsOf = (rows: readonly Row[]) =>
  kinds.flatMap((kind) =>
    rows
      .filter((row) => row.kind === kind && row.label.trim())
      .map(({ id, label }) => ({ ...(id ? { id } : {}), kind, label: label.trim() })),
  )

function ChecklistEditor({
  rows,
  setRows,
  description,
}: {
  rows: readonly Row[]
  setRows: (update: (current: Row[]) => Row[]) => void
  description?: string
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const focus = useRef('')
  const insert = (kind: CleaningItemKind, after?: string, labels = ['']) => {
    const created = labels.map((label) => newRow(kind, label))
    setRows((current) => {
      const index = after ? current.findIndex((row) => row.key === after) + 1 : current.length
      return [...current.slice(0, index), ...created, ...current.slice(index)]
    })
    focus.current = created[created.length - 1]!.key
  }
  const change = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const remove = (key: string) => setRows((current) => current.filter((row) => row.key !== key))
  const move = (key: string, offset: number) =>
    setRows((current) => {
      const row = current.find((item) => item.key === key)!
      const siblings = current.filter((item) => item.kind === row.kind)
      const target = siblings[siblings.indexOf(row) + offset]
      if (!target) return current
      return current.map((item) => (item.key === key ? target : item.key === target.key ? row : item))
    })
  return (
    <VStack gap={4}>
      {description && <Text color="secondary">{description}</Text>}
      {kinds.map((kind) => {
        const list = rows.filter((row) => row.kind === kind)
        return (
          <VStack key={kind} gap={2}>
            <HStack gap={2} vAlign="center">
              <Heading level={3}>{kindTitles[kind]}</Heading>
              <Badge label={String(list.filter((row) => row.label.trim()).length)} />
            </HStack>
            {list.map((row, index) => {
              const name = kindTitles[kind] + ', point ' + (index + 1)
              return (
                <HStack key={row.key} gap={1} vAlign="center">
                  <StackItem size="fill">
                    <TextInput
                      ref={(element: HTMLInputElement | null) => {
                        if (!element) return void inputs.current.delete(row.key)
                        inputs.current.set(row.key, element)
                        if (focus.current !== row.key) return
                        focus.current = ''
                        element.focus()
                      }}
                      label={name}
                      isLabelHidden
                      width="100%"
                      value={row.label}
                      placeholder={examples[kind]}
                      onChange={(value) => change(row.key, { label: value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          insert(kind, row.key)
                        } else if (event.key === 'Backspace' && !row.label) {
                          event.preventDefault()
                          remove(row.key)
                          const previous = list[index - 1]
                          if (previous) inputs.current.get(previous.key)?.focus()
                        }
                      }}
                      onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                        const lines = event.clipboardData
                          .getData('text')
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                        if (lines.length < 2) return
                        event.preventDefault()
                        change(row.key, { label: row.label + lines[0] })
                        insert(kind, row.key, lines.slice(1))
                      }}
                    />
                  </StackItem>
                  <IconButton
                    label={'Supprimer : ' + (row.label || name)}
                    icon={<Icon icon={Trash2} />}
                    variant="ghost"
                    onClick={() => remove(row.key)}
                  />
                  <MoreMenu
                    label={'Autres actions : ' + (row.label || name)}
                    alignment="end"
                    presentation="adaptive"
                    items={[
                      ...(index > 0 ? [{ label: 'Monter', onClick: () => move(row.key, -1) }] : []),
                      ...(index < list.length - 1 ? [{ label: 'Descendre', onClick: () => move(row.key, 1) }] : []),
                      {
                        label: kind === 'task' ? 'Passer en « À vérifier »' : 'Passer en « À faire »',
                        onClick: () => change(row.key, { kind: kind === 'task' ? 'check' : 'task' }),
                      },
                    ]}
                  />
                </HStack>
              )
            })}
            <HStack>
              <Button
                label={kind === 'task' ? 'Ajouter un point à faire' : 'Ajouter un point à vérifier'}
                icon={<Icon icon={Plus} />}
                variant="ghost"
                size="sm"
                onClick={() => insert(kind, list[list.length - 1]?.key)}
              />
            </HStack>
          </VStack>
        )
      })}
      <Text type="supporting">
        Entrée ajoute la ligne suivante, Retour arrière efface une ligne vide, coller une liste crée un point par ligne.
        Les lignes vides sont ignorées.
      </Text>
    </VStack>
  )
}

function Lines({ text }: { text: string }) {
  return (
    <VStack gap={1}>
      {text.split('\n').map((line, index) => (
        <Text key={index}>{line || ' '}</Text>
      ))}
    </VStack>
  )
}

function PlanEditor({
  options,
  day,
  agentId = '',
  lotIds = [],
  close,
  saved,
}: {
  options: CleaningOptions
  day: string
  agentId?: string
  lotIds?: readonly string[]
  close: () => void
  saved: (created: number, skipped: readonly string[]) => void
}) {
  const [lots, setLots] = useState<string[]>([...lotIds]),
    [agent, setAgent] = useState(() => defaultAgent(options.agents, agentId, rememberedAgent())),
    [date, setDate] = useState(day),
    [template, setTemplate] = useState(''),
    [priority, setPriority] = useState<Priority>('normal'),
    [note, setNote] = useState(''),
    [rows, setRows] = useState<Row[]>([])
  const mutation = useMutation()
  const loadMovements = useCallback(() => call((client) => client.cleaning.movements({ query: { day: date } })), [date])
  const movements = useQuery(date ? 'cleaning-movements:' + date : '', loadMovements)
  const loadDay = useCallback(
    () => call((client) => client.cleaning.tasks({ query: { from: date, to: date } })),
    [date],
  )
  const planned = useQuery(date ? 'cleaning-day:' + date : '', loadDay)
  const active = new Set(options.lots.map((lot) => lot.id))
  const taken = new Set((planned.data ?? []).filter((task) => task.status !== 'cancelled').map((task) => task.lot_id))
  const free = lots.filter((id) => !taken.has(id))
  const blocked = lots.filter((id) => taken.has(id))
  const lotOf = (id: string) => options.lots.find((lot) => lot.id === id)
  const fallback = options.templates.find((item) => item.is_default)
  const templateFor = (lotId: string) =>
    template === 'none'
      ? undefined
      : options.templates.find((item) => item.id === (template || lotOf(lotId)?.template_id || fallback?.id || ''))
  const groups = [...new Set(free.map((id) => templateFor(id)?.id ?? ''))].map((id) => ({
    template: options.templates.find((item) => item.id === id),
    lots: free.filter((lot) => (templateFor(lot)?.id ?? '') === id),
  }))
  const numbers = (ids: readonly string[]) => ids.map((id) => lotOf(id)?.number ?? '?').join(', ')
  const add = (ids: readonly string[]) =>
    setLots((current) => [...new Set([...current, ...ids.filter((id) => active.has(id))])])
  const departures = (movements.data?.departures ?? []).filter((id) => active.has(id)),
    arrivals = (movements.data?.arrivals ?? []).filter((id) => active.has(id)),
    buildings = [...new Set(options.lots.map((lot) => lot.building_name).filter(Boolean))]
  const extra = pointsOf(rows)
  return (
    <Editor
      title="Planifier un ménage"
      width={760}
      label={free.length > 1 ? 'Planifier ' + free.length + ' lots' : 'Planifier'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!free.length || !agent || !date}
      submit={() =>
        void mutation.run(async () => {
          const result = await call((client) =>
            client.cleaning.create({
              payload: {
                lot_ids: free,
                agent_id: agent,
                day: date,
                template_id: template,
                note,
                priority,
                items: extra,
              },
            }),
          )
          rememberAgent(agent)
          saved(result.created, result.skipped)
        })
      }
    >
      <VStack gap={3}>
        <Heading level={3}>Lots</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            size="sm"
            label={'Sorties du jour (' + departures.length + ')'}
            isDisabled={!departures.length}
            onClick={() => add(departures)}
          />
          <Button
            size="sm"
            label={'Entrées du jour (' + arrivals.length + ')'}
            isDisabled={!arrivals.length}
            onClick={() => add(arrivals)}
          />
          {buildings.length > 1 &&
            buildings.map((building) => (
              <Button
                key={building}
                size="sm"
                label={building}
                aria-label={'Ajouter les lots du bâtiment ' + building}
                onClick={() => add(options.lots.filter((lot) => lot.building_name === building).map((lot) => lot.id))}
              />
            ))}
          {lots.length > 0 && <Button size="sm" variant="ghost" label="Vider" onClick={() => setLots([])} />}
        </HStack>
        <MultiSelector
          label="Lots"
          isLabelHidden
          options={options.lots.map((lot) => ({ value: lot.id, label: lotLabel(lot) }))}
          value={lots}
          onChange={setLots}
          hasSearch
          searchPlaceholder="Rechercher un lot"
          placeholder="Aucun lot choisi"
          emptyText="Aucun lot actif."
          emptySearchText="Aucun lot trouvé."
          triggerDisplay="badges"
        />
        {blocked.length > 0 && (
          <Banner
            status="warning"
            title={plural(blocked.length, 'lot déjà planifié', 'lots déjà planifiés') + ' ce jour'}
            description={'Lots ' + numbers(blocked) + ' : ils seront ignorés.'}
          />
        )}
      </VStack>
      <VStack gap={3}>
        <Heading level={3}>Qui et quand</Heading>
        <AgentField agents={options.agents} value={agent} onChange={setAgent} />
        <HStack gap={3} wrap="wrap">
          <DateField label="Jour" value={date} onChange={setDate} />
          <PriorityField value={priority} onChange={setPriority} />
        </HStack>
      </VStack>
      <VStack gap={3}>
        <Heading level={3}>Checklist</Heading>
        <Selector
          label="Fiche de ménage"
          value={template || 'lot'}
          onChange={(value) => setTemplate(value === 'lot' ? '' : value)}
          presentation="adaptive"
          options={[
            { value: 'lot', label: 'Fiche habituelle de chaque lot' },
            ...options.templates.map((item) => ({ value: item.id, label: item.name })),
            { value: 'none', label: 'Aucune fiche : uniquement les points saisis ici' },
          ]}
        />
        {template !== 'none' &&
          groups.map((group) => (
            <List
              key={group.template?.id ?? 'none'}
              hasDividers
              header={
                <VStack gap={0}>
                  <Text weight="semibold">{group.template ? group.template.name : 'Sans fiche'}</Text>
                  <Text type="supporting">{'Lots ' + numbers(group.lots)}</Text>
                </VStack>
              }
            >
              {group.template?.items.length ? (
                group.template.items.map((item, index) => (
                  <ListItem key={index} label={item.label} description={kindTitles[item.kind]} />
                ))
              ) : (
                <ListItem
                  label={
                    group.template
                      ? 'Cette fiche est vide.'
                      : 'Aucune fiche par défaut : seuls les points ajoutés ci-dessous seront à cocher.'
                  }
                />
              )}
            </List>
          ))}
        <ChecklistEditor
          rows={rows}
          setRows={setRows}
          description={
            template === 'none'
              ? 'Ce que l’agent coche dans chaque lot.'
              : 'Points en plus de la fiche, pour ce ménage uniquement : la fiche n’est pas modifiée.'
          }
        />
      </VStack>
      <TextArea
        label="Consigne (information, sans case à cocher)"
        description="Affichée en tête de la tâche."
        value={note}
        onChange={setNote}
        isOptional
        rows={3}
        placeholder="Clés à l’accueil, départ à 10 h…"
      />
    </Editor>
  )
}

export const taskComments = (task: Pick<CleaningTask, 'note' | 'report' | 'remarks'>) =>
  [
    task.note && 'Consigne : ' + task.note,
    task.report && 'Commentaire : ' + task.report,
    ...task.remarks.map((remark) => 'Constat · ' + remark),
  ].filter((comment): comment is string => Boolean(comment))
export function CommentIcon({ comments }: { comments: readonly string[] }) {
  return comments.length ? (
    <Tooltip
      content={
        <VStack gap={1}>
          {comments.map((comment, index) => (
            <Text key={index} color="inherit">
              {comment}
            </Text>
          ))}
        </VStack>
      }
      touchTrigger="tap"
    >
      <Icon icon={MessageSquareText} size="sm" color="secondary" label={comments.join(' · ')} />
    </Tooltip>
  ) : null
}

type BulkMode = 'agent' | 'day' | 'priority' | 'items'
const bulkTitles: Record<BulkMode, string> = {
  agent: 'Réaffecter',
  day: 'Changer le jour',
  priority: 'Changer la priorité',
  items: 'Ajouter des points',
}

function BulkEditor({
  mode,
  tasks,
  options,
  close,
  saved,
}: {
  mode: BulkMode
  tasks: readonly CleaningTask[]
  options: CleaningOptions
  close: () => void
  saved: (updated: number, skipped: number) => void
}) {
  const [agent, setAgent] = useState(() => defaultAgent(options.agents, rememberedAgent())),
    [day, setDay] = useState(tasks[0]?.day ?? today()),
    [priority, setPriority] = useState<Priority>('normal'),
    [rows, setRows] = useState<Row[]>(() => [newRow('task')])
  const mutation = useMutation()
  const items = pointsOf(rows)
  const change =
    mode === 'agent'
      ? { agent_id: agent }
      : mode === 'day'
        ? { day }
        : mode === 'priority'
          ? { priority }
          : { items: items.map(({ kind, label }) => ({ kind, label })) }
  return (
    <Editor
      title={bulkTitles[mode] + ' · ' + plural(tasks.length, 'tâche', 'tâches')}
      label={bulkTitles[mode]}
      width={mode === 'items' ? 640 : 560}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={(mode === 'agent' && !agent) || (mode === 'day' && !day) || (mode === 'items' && !items.length)}
      submit={() =>
        void mutation.run(async () => {
          const result = await call((client) =>
            client.cleaning.bulk({ payload: { task_ids: tasks.map((task) => task.id), ...change } }),
          )
          if (mode === 'agent') rememberAgent(agent)
          saved(result.updated, result.skipped)
        })
      }
    >
      <Text color="secondary">
        {tasks
          .slice(0, 12)
          .map((task) => 'Lot ' + task.lot_number + ' (' + dateLabel(task.day) + ')')
          .join(', ') + (tasks.length > 12 ? '…' : '')}
      </Text>
      {mode === 'agent' && <AgentField agents={options.agents} value={agent} onChange={setAgent} />}
      {mode === 'day' && (
        <>
          <DateField label="Nouveau jour" value={day} onChange={setDay} />
          <Text color="secondary">
            L’agent, la consigne et la checklist sont conservés ; l’ordre de passage est remis à zéro.
          </Text>
        </>
      )}
      {mode === 'priority' && <PriorityField value={priority} onChange={setPriority} />}
      {mode === 'items' && (
        <ChecklistEditor
          rows={rows}
          setRows={setRows}
          description="Ajoutés à la fin de la checklist de chaque tâche choisie ; les fiches ne sont pas modifiées."
        />
      )}
    </Editor>
  )
}

function OrderEditor({
  date,
  tasks,
  close,
  saved,
}: {
  date: string
  tasks: readonly CleaningTask[]
  close: () => void
  saved: () => void
}) {
  const [list, setList] = useState([...tasks])
  const mutation = useMutation()
  const move = (index: number, offset: number) =>
    setList((current) => {
      const next = [...current]
      const [task] = next.splice(index, 1)
      next.splice(index + offset, 0, task!)
      return next
    })
  return (
    <Editor
      title={'Ordre de passage du ' + dayLabel(date)}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () =>
            call((client) => client.cleaning.order({ payload: { day: date, task_ids: list.map((task) => task.id) } })),
          saved,
        )
      }
    >
      <Text color="secondary">
        Les ménages prévus s’affichent dans cet ordre pour les agents. Un ménage déplacé à un autre jour perd sa place.
      </Text>
      <List hasDividers>
        {list.map((task, index) => (
          <ListItem
            key={task.id}
            label={index + 1 + '. ' + taskLot(task)}
            description={task.agent_name + ' · ' + (task.template_name || 'Sans fiche')}
            endContent={
              <HStack gap={1} vAlign="center">
                <PriorityToken priority={task.priority} />
                <MoreMenu
                  label={'Déplacer ' + taskLot(task)}
                  alignment="end"
                  presentation="adaptive"
                  items={[
                    ...(index > 0 ? [{ label: 'Avancer', onClick: () => move(index, -1) }] : []),
                    ...(index < list.length - 1 ? [{ label: 'Reculer', onClick: () => move(index, 1) }] : []),
                  ]}
                />
              </HStack>
            }
          />
        ))}
      </List>
    </Editor>
  )
}

function Progress({ task }: { task: CleaningTask }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text>{task.total ? task.handled + '/' + task.total : '—'}</Text>
      {task.issues > 0 && <Token label={plural(task.issues, 'anomalie', 'anomalies')} color="orange" size="sm" />}
      <CommentIcon comments={taskComments(task)} />
    </HStack>
  )
}

function DayTable({
  date,
  tasks,
  selected,
  select,
  order,
}: {
  date: string
  tasks: readonly CleaningTask[]
  selected: ReadonlySet<string>
  select: (ids: readonly string[], isSelected: boolean) => void
  order: (date: string, tasks: readonly CleaningTask[]) => void
}) {
  const movable = tasks.filter((task) => task.status === 'planned')
  const all = movable.length > 0 && movable.every((task) => selected.has(task.id))
  const selection = useTableSelection<CleaningTask>({
    getIsItemSelected: (task) => selected.has(task.id),
    onSelectItem: ({ item, isSelected }) => select([item.id], isSelected),
    onSelectAll: ({ isAllSelected }) =>
      select(
        movable.map((task) => task.id),
        isAllSelected,
      ),
    getIsAllSelected: () => all,
    getIsIndeterminate: () => !all && movable.some((task) => selected.has(task.id)),
    getIsItemSelectable: (task) => task.status === 'planned',
    getRowLabel: taskLot,
  })
  const mobile = useMobile()
  const rank = (task: CleaningTask) =>
    task.status === 'planned' && task.position !== null ? movable.indexOf(task) + 1 + '. ' : ''
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={2} vAlign="center">
          <Heading level={2}>{dayLabel(date)}</Heading>
          {date === today() && <Token label="Aujourd’hui" color="blue" size="sm" />}
        </HStack>
        {movable.length > 1 && (
          <Button
            label="Ordre de passage"
            aria-label={'Ordre de passage du ' + dayLabel(date)}
            size="sm"
            onClick={() => order(date, movable)}
          />
        )}
      </HStack>
      {mobile ? (
        <List hasDividers>
          {tasks.map((task) => (
            <ListItem
              key={task.id}
              href={'#cleaning/' + task.id}
              label={rank(task) + taskLot(task)}
              description={[
                task.agent_name,
                task.total ? task.handled + '/' + task.total + ' points' : 'Sans checklist',
                task.issues ? plural(task.issues, 'anomalie', 'anomalies') : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              startContent={
                task.status === 'planned' ? (
                  <CheckboxInput
                    label={'Sélectionner ' + taskLot(task)}
                    isLabelHidden
                    value={selected.has(task.id)}
                    onChange={(checked) => select([task.id], checked)}
                  />
                ) : undefined
              }
              endContent={
                <VStack gap={1} hAlign="end">
                  <StateToken state={task.status} />
                  {task.priority !== 'normal' && <PriorityToken priority={task.priority} />}
                </VStack>
              }
            />
          ))}
        </List>
      ) : (
        <Table
          data={[...tasks]}
          idKey="id"
          dividers="rows"
          plugins={{ selection }}
          columns={[
            {
              key: 'lot_number',
              header: 'Lot',
              width: proportional(2, { minWidth: 140 }),
              renderCell: (task) => (
                <VStack gap={0}>
                  <Link href={'#cleaning/' + task.id}>{rank(task) + taskLot(task)}</Link>
                  <Text type="supporting">{task.template_name || 'Sans fiche'}</Text>
                </VStack>
              ),
            },
            {
              key: 'agent_name',
              header: 'Agent',
              width: proportional(1, { minWidth: 100 }),
              renderCell: (task) => <Text>{task.agent_name}</Text>,
            },
            {
              key: 'handled',
              header: 'Points traités',
              width: proportional(1, { minWidth: 110 }),
              renderCell: (task) => <Progress task={task} />,
            },
            {
              key: 'priority',
              header: 'Priorité',
              width: proportional(1, { minWidth: 90 }),
              renderCell: (task) => <PriorityToken priority={task.priority} />,
            },
            {
              key: 'status',
              header: 'Statut',
              width: proportional(1, { minWidth: 90 }),
              renderCell: (task) => <StateToken state={task.status} />,
            },
          ]}
        />
      )}
    </VStack>
  )
}

export function LotCleaning({ lotId, archived }: { lotId: string; archived: boolean }) {
  const [page, setPage] = useState(1),
    [planning, setPlanning] = useState(false),
    [success, setSuccess] = useState('')
  const load = useCallback(
    () => call((client) => client.cleaning.lotTasks({ params: { id: lotId }, query: { page } })),
    [lotId, page],
  )
  const result = useQuery(`lot-cleaning:${lotId}:${page}`, load)
  const options = useQuery<CleaningOptions | null>(
    archived ? '' : 'cleaning-options',
    archived ? noOptions : loadOptions,
  )
  const pagination = useTablePagination<CleaningTask>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des ménages',
  })
  return (
    <>
      <HStack gap={3} wrap="wrap" hAlign="between">
        <Heading level={2}>Ménage</Heading>
        {!archived && (
          <Button
            label="Planifier un ménage"
            variant="primary"
            isDisabled={!options.data}
            onClick={() => setPlanning(true)}
          />
        )}
      </HStack>
      <Feedback success={success} error={options.error} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.items.length ? (
        <Table
          data={[...result.data.items]}
          idKey="id"
          rowCount={result.data.total}
          rowIndexStart={(page - 1) * 20 + 1}
          plugins={{ pagination }}
          dividers="rows"
          columns={[
            {
              key: 'day',
              header: 'Jour',
              width: proportional(1),
              renderCell: (task) => <Link href={'#cleaning/' + task.id}>{dateLabel(task.day)}</Link>,
            },
            {
              key: 'agent_name',
              header: 'Agent',
              width: proportional(1),
              renderCell: (task) => <Text>{task.agent_name}</Text>,
            },
            {
              key: 'template_name',
              header: 'Fiche',
              width: proportional(1),
              renderCell: (task) => <Text>{task.template_name || 'Sans fiche'}</Text>,
            },
            {
              key: 'handled',
              header: 'Points traités',
              width: proportional(1),
              renderCell: (task) => <Progress task={task} />,
            },
            {
              key: 'priority',
              header: 'Priorité',
              width: proportional(1),
              renderCell: (task) => <PriorityToken priority={task.priority} />,
            },
            {
              key: 'status',
              header: 'Statut',
              width: proportional(1),
              renderCell: (task) => <StateToken state={task.status} />,
            },
          ]}
        />
      ) : (
        <Text>Aucun ménage enregistré pour ce lot.</Text>
      )}
      {planning && options.data && (
        <PlanEditor
          options={options.data}
          day={today()}
          lotIds={[lotId]}
          close={() => setPlanning(false)}
          saved={(created) => {
            setPlanning(false)
            setSuccess(created > 1 ? created + ' tâches planifiées.' : 'Tâche planifiée.')
            setPage(1)
            void result.refresh()
          }}
        />
      )}
    </>
  )
}

const plannedMessage = (created: number, skipped: readonly string[]) =>
  plural(created, 'tâche planifiée', 'tâches planifiées') +
  (skipped.length ? ' ; déjà planifiés ce jour, ignorés : lots ' + skipped.join(', ') : '') +
  '.'
const bulkMessage = (updated: number, skipped: number) =>
  plural(updated, 'tâche modifiée', 'tâches modifiées') +
  (skipped
    ? ' ; ' + plural(skipped, 'tâche terminée ou annulée ignorée', 'tâches terminées ou annulées ignorées')
    : '') +
  '.'

function MyDay({ me }: { me: Me }) {
  const [date, setDate] = useHashParam('date', today())
  const load = useCallback(() => call((client) => client.cleaning.tasks({ query: { from: date, to: date } })), [date])
  const result = useQuery(`cleaning:${date}:${date}:${me.id}:all`, load)
  const tasks = result.data ?? []
  const todo = tasks.filter((task) => task.status === 'planned'),
    done = tasks.filter((task) => task.status === 'done')
  return (
    <PageLayout
      header={
        <VStack gap={1}>
          <Heading level={1}>Ma journée</Heading>
          <Text color="secondary">Vos lots dans l’ordre de passage. Ouvrez un lot pour cocher sa checklist.</Text>
        </VStack>
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="center">
        <PeriodNav
          label="Navigation par jour"
          previous="Précédent"
          current="Aujourd’hui"
          next="Suivant"
          onPrevious={() => setDate(addDays(date, -1))}
          onCurrent={() => setDate(today())}
          onNext={() => setDate(addDays(date, 1))}
        />
        <Text weight="semibold">{dayLabel(date)}</Text>
      </HStack>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : !todo.length && !done.length ? (
        <Text>Aucun ménage prévu ce jour.</Text>
      ) : (
        <>
          <ProgressBar
            label="Lots terminés"
            value={done.length}
            max={todo.length + done.length}
            hasValueLabel
            formatValueLabel={(value, max) => value + '/' + max}
            variant={todo.length ? 'accent' : 'success'}
          />
          {todo.length ? (
            <VStack gap={3}>
              {todo.map((task, index) => (
                <ClickableCard
                  key={task.id}
                  label={'Ouvrir ' + taskLot(task)}
                  href={'#cleaning/' + task.id}
                  variant={index === 0 ? 'blue' : 'default'}
                  elevation="low"
                >
                  <VStack gap={2}>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Heading level={2}>{index + 1 + '. ' + taskLot(task)}</Heading>
                      {index === 0 && <Token label="Prochain lot" color="blue" size="sm" />}
                      {task.priority !== 'normal' && <PriorityToken priority={task.priority} />}
                    </HStack>
                    {task.total > 0 && (
                      <ProgressBar
                        label="Points traités"
                        value={task.handled}
                        max={task.total}
                        hasValueLabel
                        formatValueLabel={(value, max) => value + '/' + max}
                      />
                    )}
                    {task.note && <Text>{'Consigne : ' + task.note.split('\n')[0]}</Text>}
                  </VStack>
                </ClickableCard>
              ))}
            </VStack>
          ) : (
            <Banner status="success" title="Journée terminée" description="Tous vos lots du jour sont faits." />
          )}
          {done.length > 0 && (
            <List hasDividers header={<Heading level={2}>Terminés</Heading>}>
              {done.map((task) => (
                <ListItem
                  key={task.id}
                  label={taskLot(task)}
                  href={'#cleaning/' + task.id}
                  description={task.completed_at ? 'Terminé ' + timeLabel(task.completed_at) : undefined}
                  endContent={
                    task.issues > 0 ? (
                      <Token label={plural(task.issues, 'anomalie', 'anomalies')} color="orange" size="sm" />
                    ) : undefined
                  }
                />
              ))}
            </List>
          )}
        </>
      )}
    </PageLayout>
  )
}

export function Cleaning({ me }: { me: Me }) {
  return me.role === 'cleaner' ? <MyDay me={me} /> : <Planning />
}

function Planning() {
  const mobile = useMobile()
  const [date, setDate] = useHashParam('date', today()),
    [agent, setAgent] = useHashParam('agent', ''),
    [priority, setPriority] = useState<PriorityFilterValue>('all'),
    [view, setView] = useHashParam('vue', mobile ? 'day' : 'week'),
    [planning, setPlanning] = useState(false),
    [selected, setSelected] = useState<ReadonlySet<string>>(new Set()),
    [bulk, setBulk] = useState<BulkMode | null>(null),
    [cancelling, setCancelling] = useState(false),
    [ordering, setOrdering] = useState<{ date: string; tasks: readonly CleaningTask[] } | null>(null),
    [success, setSuccess] = useState('')
  const week = view === 'week',
    from = week ? monday(date) : date,
    to = week ? addDays(from, 6) : date,
    step = week ? 7 : 1
  const load = useCallback(
    () =>
      call((client) =>
        client.cleaning.tasks({
          query: { from, to, ...(agent ? { agent } : {}), ...(priority !== 'all' ? { priority } : {}) },
        }),
      ),
    [from, to, agent, priority],
  )
  const result = useQuery(`cleaning:${from}:${to}:${agent}:${priority}`, load)
  const options = useQuery<CleaningOptions | null>('cleaning-options', loadOptions)
  const mutation = useMutation()
  const tasks = result.data ?? []
  const active = tasks.filter((task) => task.status !== 'cancelled')
  const done = active.filter((task) => task.status === 'done').length
  const issues = active.reduce((sum, task) => sum + task.issues, 0)
  const movable = tasks.filter((task) => task.status === 'planned')
  const chosen = movable.filter((task) => selected.has(task.id))
  const select = (ids: readonly string[], isSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (isSelected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const clear = () => setSelected(new Set())
  const changed = (message: string) => {
    setBulk(null)
    setCancelling(false)
    clear()
    setSuccess(message)
    void result.refresh()
  }
  const days = [...new Set(tasks.map((task) => task.day))]
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Ménage</Heading>
            <Text color="secondary">
              Cochez des tâches pour les modifier ensemble ; ouvrez une tâche pour sa checklist.
            </Text>
          </VStack>
          <Button
            label="Planifier un ménage"
            variant="primary"
            isDisabled={!options.data}
            onClick={() => setPlanning(true)}
          />
        </HStack>
      }
      navigation={<CleaningTabs current="planning" />}
      footer={
        chosen.length > 0 && options.data && mobile ? (
          <HStack gap={2} vAlign="center" hAlign="between">
            <Text weight="semibold">{plural(chosen.length, 'sélectionnée', 'sélectionnées')}</Text>
            <HStack gap={2}>
              <Button label="Désélectionner" variant="ghost" onClick={clear} />
              <DropdownMenu
                button={{ label: 'Modifier', variant: 'primary' }}
                presentation="adaptive"
                alignment="end"
                placement="above"
                items={[
                  { label: 'Réaffecter', onClick: () => setBulk('agent') },
                  { label: 'Changer le jour', onClick: () => setBulk('day') },
                  { label: 'Priorité', onClick: () => setBulk('priority') },
                  { label: 'Ajouter des points', onClick: () => setBulk('items') },
                  { type: 'divider' },
                  { label: 'Annuler les tâches', variant: 'destructive', onClick: () => setCancelling(true) },
                ]}
              />
            </HStack>
          </HStack>
        ) : chosen.length > 0 && options.data ? (
          <TableSelectionToolbar
            selection={{
              selectedKeys: new Set(chosen.map((task) => task.id)),
              selectedCount: chosen.length,
              hasSelection: true,
              clearSelection: clear,
            }}
            label="Actions groupées"
            renderSelectionLabel={(count) => plural(count, 'tâche sélectionnée', 'tâches sélectionnées')}
            clearLabel="Désélectionner"
            size="md"
            startContent={
              <HStack gap={2} wrap="wrap">
                <Button label="Réaffecter" onClick={() => setBulk('agent')} />
                <Button label="Changer le jour" onClick={() => setBulk('day')} />
                <Button label="Priorité" onClick={() => setBulk('priority')} />
                <Button label="Ajouter des points" onClick={() => setBulk('items')} />
                <Button label="Annuler" variant="destructive" onClick={() => setCancelling(true)} />
              </HStack>
            }
          />
        ) : undefined
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
        <HStack gap={3} wrap="wrap" vAlign="center">
          <PeriodNav
            label={week ? 'Navigation par semaine' : 'Navigation par jour'}
            previous={week ? 'Précédente' : 'Précédent'}
            current={week ? 'Cette semaine' : 'Aujourd’hui'}
            next={week ? 'Suivante' : 'Suivant'}
            onPrevious={() => setDate(addDays(from, -step))}
            onCurrent={() => setDate(today())}
            onNext={() => setDate(addDays(from, step))}
          />
          <VStack gap={0}>
            <Text weight="semibold">{week ? 'Du ' + dateLabel(from) + ' au ' + dateLabel(to) : dayLabel(date)}</Text>
            {result.data && (
              <Text type="supporting">
                {plural(active.length, 'tâche', 'tâches') +
                  ', ' +
                  plural(done, 'terminée', 'terminées') +
                  (issues ? ', ' + plural(issues, 'anomalie signalée', 'anomalies signalées') : '')}
              </Text>
            )}
          </VStack>
        </HStack>
        <HStack gap={2} wrap="wrap" vAlign="end">
          {!mobile && (
            <DateField
              label="Aller à la date"
              labelHidden
              value={date}
              onChange={(value) => {
                if (value) setDate(value)
              }}
            />
          )}
          {options.data && (
            <Selector
              label="Agent"
              isLabelHidden
              value={agent || 'all'}
              onChange={(value) => setAgent(value === 'all' ? '' : value)}
              options={[
                { value: 'all', label: 'Tous les agents' },
                ...options.data.agents.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          )}
          <PriorityFilter value={priority} onChange={setPriority} isLabelHidden />
          <SegmentedControl label="Vue" value={view} onChange={setView}>
            <SegmentedControlItem value="day" label="Jour" />
            <SegmentedControlItem value="week" label="Semaine" />
          </SegmentedControl>
        </HStack>
      </HStack>
      {movable.length > 1 && (
        <HStack gap={2} wrap="wrap">
          <Button
            size="sm"
            label={
              chosen.length === movable.length
                ? 'Tout désélectionner'
                : 'Sélectionner les ' + movable.length + ' tâches prévues'
            }
            onClick={() =>
              chosen.length === movable.length
                ? clear()
                : select(
                    movable.map((task) => task.id),
                    true,
                  )
            }
          />
        </HStack>
      )}
      <Feedback success={success} error={options.error} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : days.length ? (
        days.map((day) => (
          <DayTable
            key={day}
            date={day}
            tasks={tasks.filter((task) => task.day === day)}
            selected={selected}
            select={select}
            order={(target, list) => setOrdering({ date: target, tasks: list })}
          />
        ))
      ) : (
        <Text>{week ? 'Aucun ménage prévu cette semaine.' : 'Aucun ménage prévu ce jour.'}</Text>
      )}
      {ordering && (
        <OrderEditor
          date={ordering.date}
          tasks={ordering.tasks}
          close={() => setOrdering(null)}
          saved={() => {
            setOrdering(null)
            setSuccess('Ordre de passage enregistré pour le ' + dayLabel(ordering.date) + '.')
            void result.refresh()
          }}
        />
      )}
      {bulk && options.data && (
        <BulkEditor
          mode={bulk}
          tasks={chosen}
          options={options.data}
          close={() => setBulk(null)}
          saved={(updated, skipped) => changed(bulkMessage(updated, skipped))}
        />
      )}
      {cancelling && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !mutation.busy) setCancelling(false)
          }}
          title={'Annuler ' + plural(chosen.length, 'ménage', 'ménages') + ' ?'}
          description={
            mutation.error ||
            'Les tâches restent visibles comme annulées dans le planning et peuvent être rétablies une par une.'
          }
          actionLabel="Annuler les tâches"
          cancelLabel="Garder"
          isActionLoading={mutation.busy}
          onAction={() =>
            void mutation.run(async () => {
              const outcome = await call((client) =>
                client.cleaning.bulk({ payload: { task_ids: chosen.map((task) => task.id), cancel: true } }),
              )
              changed(
                plural(outcome.updated, 'tâche annulée', 'tâches annulées') +
                  (outcome.skipped ? ' ; ' + plural(outcome.skipped, 'tâche ignorée', 'tâches ignorées') : '') +
                  '.',
              )
            })
          }
        />
      )}
      {planning && options.data && (
        <PlanEditor
          options={options.data}
          day={date}
          agentId={agent}
          close={() => setPlanning(false)}
          saved={(created, skipped) => {
            setPlanning(false)
            setSuccess(plannedMessage(created, skipped))
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}

function TaskEditor({
  task,
  options,
  close,
  saved,
}: {
  task: CleaningTask
  options: CleaningOptions
  close: () => void
  saved: () => void
}) {
  const [agent, setAgent] = useState(task.agent_id),
    [day, setDay] = useState(task.day),
    [note, setNote] = useState(task.note),
    [priority, setPriority] = useState<Priority>(task.priority)
  const mutation = useMutation()
  return (
    <Editor
      title="Modifier la tâche"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!agent || !day}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.cleaning.update({ params: { id: task.id }, payload: { agent_id: agent, day, note, priority } }),
            ),
          saved,
        )
      }
    >
      <AgentField agents={options.agents} value={agent} onChange={setAgent} />
      <DateField label="Jour" value={day} onChange={setDay} />
      <PriorityField value={priority} onChange={setPriority} />
      <TextArea label="Consigne pour l’agent" value={note} onChange={setNote} isOptional />
    </Editor>
  )
}

function TaskChecklistEditor({
  taskId,
  items,
  close,
  saved,
}: {
  taskId: string
  items: readonly CleaningItem[]
  close: () => void
  saved: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsOf(items))
  const mutation = useMutation()
  return (
    <Editor
      title="Modifier la checklist"
      width={640}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () =>
            call((client) => client.cleaning.checklist({ params: { id: taskId }, payload: { items: pointsOf(rows) } })),
          saved,
        )
      }
    >
      <ChecklistEditor
        rows={rows}
        setRows={setRows}
        description="Pour cette tâche uniquement. Les points déjà cochés gardent leur état, sauf s’ils changent de section."
      />
    </Editor>
  )
}

function SaveAsTemplate({
  items,
  close,
  saved,
}: {
  items: readonly CleaningItem[]
  close: () => void
  saved: (id: string) => void
}) {
  const [name, setName] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title="Enregistrer comme fiche"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim()}
      submit={() =>
        void mutation.run(async () => {
          const result = await call((client) =>
            client.cleaning.createTemplate({
              payload: {
                name,
                is_default: false,
                items: kinds.flatMap((kind) =>
                  items.filter((item) => item.kind === kind).map(({ label }) => ({ kind, label })),
                ),
                lot_ids: [],
              },
            }),
          )
          saved(result.id)
        })
      }
    >
      <TextInput label="Nom de la fiche" value={name} onChange={setName} isRequired hasAutoFocus />
      <Text color="secondary">{pointsSummary(items) + ', repris de cette tâche. Aucun lot n’y est rattaché.'}</Text>
    </Editor>
  )
}

function IssueEditor({ item, close, saved }: { item: CleaningItem; close: () => void; saved: () => void }) {
  const [note, setNote] = useState(item.state === 'issue' ? item.note : '')
  const mutation = useMutation()
  const title = item.kind === 'task' ? 'Non fait' : 'Anomalie'
  return (
    <Editor
      title={title + ' · ' + item.label}
      label={item.kind === 'task' ? 'Marquer non fait' : 'Signaler'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () => call((client) => client.cleaning.item({ params: { id: item.id }, payload: { state: 'issue', note } })),
          saved,
        )
      }
    >
      <TextArea
        label={item.kind === 'task' ? 'Pourquoi ?' : 'Qu’avez-vous constaté ?'}
        value={note}
        onChange={setNote}
        isOptional
        hasAutoFocus
        placeholder={item.kind === 'task' ? 'Produit manquant, accès impossible…' : 'Ampoule grillée, trace au mur…'}
      />
    </Editor>
  )
}

function FinishEditor({
  task,
  handled,
  issues,
  close,
  saved,
}: {
  task: CleaningTask
  handled: number
  issues: number
  close: () => void
  saved: () => void
}) {
  const [report, setReport] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title={'Terminer le ménage · Lot ' + task.lot_number}
      label="Marquer comme terminé"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () =>
            call((client) => client.cleaning.status({ params: { id: task.id }, payload: { status: 'done', report } })),
          saved,
        )
      }
    >
      <Text>
        {task.total
          ? handled +
            '/' +
            task.total +
            ' points traités' +
            (issues ? ', dont ' + plural(issues, 'signalé', 'signalés') : '') +
            '.'
          : 'Cette tâche n’a pas de checklist.'}
      </Text>
      <TextArea label="Commentaire" value={report} onChange={setReport} isOptional hasAutoFocus />
    </Editor>
  )
}

function Checklist({
  kind,
  items,
  editable,
  setState,
  report,
  checkAll,
}: {
  kind: CleaningItemKind
  items: readonly CleaningItem[]
  editable: boolean
  setState: (item: CleaningItem, state: CleaningItemState) => void
  report: (item: CleaningItem) => void
  checkAll: (kind: CleaningItemKind) => void
}) {
  const mobile = useMobile()
  const list = items.filter((item) => item.kind === kind)
  if (!list.length) return null
  const todo = list.filter((item) => item.state === 'todo').length
  return (
    <List
      hasDividers
      header={
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} vAlign="center">
            <Heading level={2}>{kindTitles[kind]}</Heading>
            <Badge label={list.length - todo + '/' + list.length} />
          </HStack>
          {editable && todo > 1 && (
            <Button
              size="sm"
              label={kind === 'task' ? 'Tout marquer fait' : 'Tout marquer conforme'}
              onClick={() => checkAll(kind)}
            />
          )}
        </HStack>
      }
    >
      {list.map((item) => (
        <ListItem
          key={item.id}
          label={item.label}
          description={
            item.state === 'todo'
              ? undefined
              : stateLabels[kind][item.state] +
                (item.state === 'issue' && item.note ? ' : ' + item.note : '') +
                (item.updated_by && item.updated_at ? ' · ' + item.updated_by + ', ' + timeLabel(item.updated_at) : '')
          }
          endContent={
            editable ? (
              <HStack gap={1} vAlign="center">
                <ToggleButton
                  label={stateLabels[kind].done + ' : ' + item.label}
                  isIconOnly={mobile}
                  size={mobile ? 'lg' : undefined}
                  icon={<Icon icon={Check} />}
                  isPressed={item.state === 'done'}
                  onPressedChange={(pressed) => setState(item, pressed ? 'done' : 'todo')}
                >
                  {stateLabels[kind].done}
                </ToggleButton>
                <ToggleButton
                  label={stateLabels[kind].issue + ' : ' + item.label}
                  isIconOnly={mobile}
                  size={mobile ? 'lg' : undefined}
                  icon={<Icon icon={X} />}
                  isPressed={item.state === 'issue'}
                  onPressedChange={(pressed) => (pressed ? report(item) : setState(item, 'todo'))}
                >
                  {stateLabels[kind].issue}
                </ToggleButton>
              </HStack>
            ) : (
              <Token
                label={stateLabels[kind][item.state]}
                color={item.state === 'issue' ? 'orange' : item.state === 'done' ? 'green' : 'default'}
                size="sm"
              />
            )
          }
        />
      ))}
    </List>
  )
}

export function CleaningTaskDetail({ id, me }: { id: string; me: Me }) {
  const manager = me.role !== 'cleaner',
    mobile = useMobile()
  const load = useCallback(() => call((client) => client.cleaning.task({ params: { id } })), [id]),
    detail = useQuery('cleaning-task:' + id, load),
    options = useQuery<CleaningOptions | null>(manager ? 'cleaning-options' : '', manager ? loadOptions : noOptions)
  const day = detail.data?.task.day ?? '',
    agentId = detail.data?.task.agent_id ?? ''
  const loadDay = useCallback(
    () => call((client) => client.cleaning.tasks({ query: { from: day, to: day, agent: agentId } })),
    [day, agentId],
  )
  const sameDay = useQuery(day ? `cleaning:${day}:${day}:${agentId}:all` : '', loadDay)
  const [dialog, setDialog] = useState<'edit' | 'checklist' | 'template' | 'finish' | 'cancel' | null>(null),
    [issue, setIssue] = useState<CleaningItem | null>(null),
    [overrides, setOverrides] = useState<Record<string, CleaningItemState>>({}),
    [failure, setFailure] = useState(''),
    [success, setSuccess] = useState('')
  const mutation = useMutation()
  const task = detail.data?.task
  useDetailCrumb(task ? 'Lot ' + task.lot_number + ' · ' + dateLabel(task.day) : '')
  if (!detail.data || !task)
    return (
      <PageLayout header={<Heading level={1}>Tâche de ménage</Heading>}>
        <Loading error={detail.error} retry={() => void detail.refresh()} />
      </PageLayout>
    )
  const items = detail.data.items.map((item) => (overrides[item.id] ? { ...item, state: overrides[item.id]! } : item))
  const editable = task.status === 'planned'
  const handled = items.filter((item) => item.state !== 'todo').length,
    issues = items.filter((item) => item.state === 'issue').length,
    remaining = items.length - handled
  const next = (sameDay.data ?? []).find((other) => other.status === 'planned' && other.id !== task.id)
  const refreshed = (message: string) => {
    setDialog(null)
    setIssue(null)
    setSuccess(message)
    void detail.refresh()
    void sameDay.refresh()
  }
  const run = (action: () => Promise<unknown>, message: string) => void mutation.run(action, () => refreshed(message))
  const setState = (item: CleaningItem, state: CleaningItemState) => {
    setOverrides((current) => ({ ...current, [item.id]: state }))
    setFailure('')
    setSuccess('')
    call((client) => client.cleaning.item({ params: { id: item.id }, payload: { state, note: '' } }))
      .then(async () => {
        await detail.refresh()
        void checkForChanges()
      })
      .catch((error: unknown) => setFailure(messageOf(error)))
      .finally(() =>
        setOverrides((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== item.id))),
      )
  }
  const status = (target: 'planned' | 'cancelled', message: string) =>
    run(
      () => call((client) => client.cleaning.status({ params: { id }, payload: { status: target, report: '' } })),
      message,
    )
  const footer = editable ? (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <Text weight="semibold">
        {remaining > 0
          ? 'Il reste ' + plural(remaining, 'point', 'points') + ' à traiter'
          : 'Tous les points sont traités'}
      </Text>
      <StackItem size={mobile ? 'fill' : undefined}>
        <Button
          label="Terminer le ménage"
          variant="primary"
          size="lg"
          width={mobile ? '100%' : undefined}
          isDisabled={remaining > 0 || mutation.busy}
          onClick={() => setDialog('finish')}
        />
      </StackItem>
    </HStack>
  ) : task.status === 'done' ? (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <Text weight="semibold">Ménage terminé</Text>
      <StackItem size={mobile ? 'fill' : undefined}>
        {next ? (
          <Button
            label={'Lot suivant : ' + taskLot(next)}
            variant="primary"
            size="lg"
            width={mobile ? '100%' : undefined}
            href={'#cleaning/' + next.id}
          />
        ) : (
          <Button
            label={manager ? 'Retour au planning' : 'Retour à ma journée'}
            width={mobile ? '100%' : undefined}
            href="#cleaning"
          />
        )}
      </StackItem>
    </HStack>
  ) : undefined
  const actions = [
    ...(manager && task.status === 'done'
      ? [{ label: 'Rouvrir', onClick: () => status('planned', 'Tâche rouverte.') }]
      : []),
    ...(manager && task.status === 'cancelled'
      ? [{ label: 'Rétablir', onClick: () => status('planned', 'Tâche rétablie.') }]
      : []),
    ...(manager && editable ? [{ label: 'Modifier la checklist', onClick: () => setDialog('checklist') }] : []),
    { label: 'Voir le lot', href: '#lots/' + task.lot_id },
    ...(manager && editable ? [{ label: 'Modifier la tâche', onClick: () => setDialog('edit') }] : []),
    ...(manager && items.length ? [{ label: 'Enregistrer comme fiche', onClick: () => setDialog('template') }] : []),
    ...(manager && editable
      ? [
          { type: 'divider' as const },
          { label: 'Annuler la tâche', variant: 'destructive' as const, onClick: () => setDialog('cancel') },
        ]
      : []),
  ]
  return (
    <PageLayout
      footer={footer}
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={1}>{taskLot(task)}</Heading>
              <StateToken state={task.status} />
              <PriorityToken priority={task.priority} />
            </HStack>
            <Text>
              {dayLabel(task.day)} · {task.agent_name} · {task.template_name || 'Sans fiche'}
            </Text>
          </VStack>
          {mobile ? (
            <MoreMenu
              label="Actions sur la tâche"
              alignment="end"
              presentation="adaptive"
              isDisabled={mutation.busy || (manager && !options.data)}
              items={actions}
            />
          ) : (
            <HStack gap={2} wrap="wrap">
              {manager && task.status === 'done' && (
                <Button
                  label="Rouvrir"
                  isLoading={mutation.busy}
                  onClick={() => status('planned', 'Tâche rouverte.')}
                />
              )}
              {manager && task.status === 'cancelled' && (
                <Button
                  label="Rétablir"
                  isLoading={mutation.busy}
                  onClick={() => status('planned', 'Tâche rétablie.')}
                />
              )}
              {manager && editable && (
                <Button
                  label="Modifier la checklist"
                  isDisabled={mutation.busy}
                  onClick={() => setDialog('checklist')}
                />
              )}
              <Button label="Voir le lot" href={'#lots/' + task.lot_id} />
              {manager && (
                <MoreMenu
                  label="Gérer la tâche"
                  alignment="end"
                  presentation="adaptive"
                  isDisabled={mutation.busy || !options.data}
                  items={[
                    ...(editable ? [{ label: 'Modifier la tâche', onClick: () => setDialog('edit') }] : []),
                    ...(items.length
                      ? [{ label: 'Enregistrer comme fiche', onClick: () => setDialog('template') }]
                      : []),
                    ...(editable
                      ? [
                          { type: 'divider' as const },
                          {
                            label: 'Annuler la tâche',
                            variant: 'destructive' as const,
                            onClick: () => setDialog('cancel'),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            </HStack>
          )}
        </HStack>
      }
    >
      <Feedback error={failure || mutation.error} success={success} />
      {task.note && (
        <Banner status="info" title="Consigne">
          <Lines text={task.note} />
        </Banner>
      )}
      {task.status === 'done' && task.completed_at && (
        <Text>
          Terminé par {task.completed_by} le {timeLabel(task.completed_at)}
          {task.report ? ' · ' + task.report : ''}
        </Text>
      )}
      {items.length > 0 ? (
        <ProgressBar
          label="Points traités"
          value={handled}
          max={items.length}
          hasValueLabel
          formatValueLabel={(value, max) => value + '/' + max}
          variant={task.status === 'done' ? 'success' : 'accent'}
        />
      ) : (
        <Text>Aucune checklist pour cette tâche.</Text>
      )}
      {kinds.map((kind) => (
        <Checklist
          key={kind}
          kind={kind}
          items={items}
          editable={editable}
          setState={setState}
          report={setIssue}
          checkAll={(target) =>
            run(() => call((client) => client.cleaning.checkAll({ params: { id }, payload: { kind: target } })), '')
          }
        />
      ))}
      {dialog === 'edit' && options.data && (
        <TaskEditor
          task={task}
          options={options.data}
          close={() => setDialog(null)}
          saved={() => refreshed('Tâche modifiée.')}
        />
      )}
      {dialog === 'checklist' && (
        <TaskChecklistEditor
          taskId={task.id}
          items={detail.data.items}
          close={() => setDialog(null)}
          saved={() => refreshed('Checklist enregistrée.')}
        />
      )}
      {dialog === 'template' && (
        <SaveAsTemplate
          items={detail.data.items}
          close={() => setDialog(null)}
          saved={(templateId) => {
            window.location.hash = '#cleaning/fiches/' + templateId
          }}
        />
      )}
      {dialog === 'finish' && (
        <FinishEditor
          task={task}
          handled={handled}
          issues={issues}
          close={() => setDialog(null)}
          saved={() => refreshed('Ménage terminé.')}
        />
      )}
      {dialog === 'cancel' && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !mutation.busy) setDialog(null)
          }}
          title={'Annuler le ménage du lot ' + task.lot_number + ' ?'}
          description="La tâche reste visible comme annulée dans le planning et peut être rétablie."
          actionLabel="Annuler la tâche"
          cancelLabel="Garder"
          isActionLoading={mutation.busy}
          onAction={() => status('cancelled', 'Tâche annulée.')}
        />
      )}
      {issue && <IssueEditor item={issue} close={() => setIssue(null)} saved={() => refreshed('')} />}
    </PageLayout>
  )
}

function TemplateEditor({
  template,
  source,
  options,
  close,
  saved,
}: {
  template?: CleaningTemplate
  source?: CleaningTemplate
  options: CleaningOptions
  close: () => void
  saved: (id: string) => void
}) {
  const initial = template ?? source
  const [name, setName] = useState(template?.name ?? (source ? source.name + ' (copie)' : '')),
    [isDefault, setIsDefault] = useState(template?.is_default ?? !options.templates.some((item) => item.is_default)),
    [rows, setRows] = useState<Row[]>(() => rowsOf(initial?.items ?? [])),
    [lots, setLots] = useState<string[]>([...(template?.lot_ids ?? [])])
  const mutation = useMutation()
  const elsewhere = (lotId: string) =>
    options.templates.find((item) => item.id !== template?.id && item.lot_ids.includes(lotId))
  return (
    <Editor
      title={template ? 'Modifier la fiche' : source ? 'Dupliquer la fiche' : 'Nouvelle fiche de ménage'}
      width={640}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim()}
      submit={() =>
        void mutation.run(async () => {
          const payload = {
            name,
            is_default: isDefault,
            items: pointsOf(rows).map(({ kind, label }) => ({ kind, label })),
            lot_ids: lots,
          }
          const result = await call((client) =>
            template
              ? client.cleaning.updateTemplate({ params: { id: template.id }, payload })
              : client.cleaning.createTemplate({ payload }),
          )
          saved(result.id)
        })
      }
    >
      <TextInput
        label="Nom de la fiche"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Ménage standard, remise en état après départ…"
      />
      <CheckboxInput
        label="Fiche par défaut"
        description="Appliquée à tous les lots qui n’ont pas de fiche spécifique."
        value={isDefault}
        onChange={setIsDefault}
      />
      <ChecklistEditor rows={rows} setRows={setRows} />
      <MultiSelector
        label="Lots utilisant cette fiche"
        description="Un lot n’a qu’une fiche spécifique : le choisir ici le retire de son ancienne fiche."
        isOptional
        options={options.lots.map((lot) => {
          const other = elsewhere(lot.id)
          return { value: lot.id, label: lotLabel(lot) + (other ? ' (actuellement : ' + other.name + ')' : '') }
        })}
        value={lots}
        onChange={setLots}
        hasSearch
        searchPlaceholder="Rechercher un lot"
        placeholder={isDefault ? 'Tous les lots sans fiche spécifique' : 'Aucun lot'}
        emptyText="Aucun lot actif."
        emptySearchText="Aucun lot trouvé."
        triggerDisplay="badges"
      />
      <Text color="secondary">
        Les modifications s’appliquent aux prochains ménages planifiés ; les tâches existantes gardent leur checklist.
      </Text>
    </Editor>
  )
}

export function CleaningTemplates() {
  const options = useQuery('cleaning-options', loadOptions),
    [creating, setCreating] = useState(false)
  const templates = options.data?.templates ?? []
  const lotNumbers = (ids: readonly string[]) =>
    ids.map((id) => options.data?.lots.find((lot) => lot.id === id)?.number).filter(Boolean)
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Ménage</Heading>
            <Text color="secondary">Fiches modèles : tâches à faire et points à vérifier dans chaque lot.</Text>
          </VStack>
          <Button
            label="Nouvelle fiche"
            variant="primary"
            isDisabled={!options.data}
            onClick={() => setCreating(true)}
          />
        </HStack>
      }
      navigation={<CleaningTabs current="templates" />}
    >
      {!options.data ? (
        <Loading error={options.error} retry={() => void options.refresh()} />
      ) : templates.length ? (
        <Table
          data={[...templates]}
          idKey="id"
          dividers="rows"
          columns={[
            {
              key: 'name',
              header: 'Fiche',
              width: proportional(2),
              renderCell: (row) => (
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Link href={'#cleaning/fiches/' + row.id}>{row.name}</Link>
                  {row.is_default && <Token label="Par défaut" color="blue" size="sm" />}
                </HStack>
              ),
            },
            {
              key: 'items',
              header: 'Points',
              width: proportional(2),
              renderCell: (row) => <Text>{pointsSummary(row.items)}</Text>,
            },
            {
              key: 'lot_ids',
              header: 'Lots',
              width: proportional(2),
              renderCell: (row) => {
                const numbers = lotNumbers(row.lot_ids)
                return (
                  <Text>
                    {row.is_default
                      ? 'Tous les lots sans fiche spécifique' + (numbers.length ? ' et ' + numbers.join(', ') : '')
                      : numbers.length
                        ? numbers.join(', ')
                        : 'Aucun lot'}
                  </Text>
                )
              },
            },
          ]}
        />
      ) : (
        <Text>
          Aucune fiche. Créez une fiche par défaut, par exemple « Ménage standard », avec ses tâches à faire et ses
          points à vérifier : elle sera appliquée automatiquement aux lots planifiés.
        </Text>
      )}
      {creating && options.data && (
        <TemplateEditor
          options={options.data}
          close={() => setCreating(false)}
          saved={(id) => {
            window.location.hash = '#cleaning/fiches/' + id
          }}
        />
      )}
    </PageLayout>
  )
}

export function CleaningTemplateDetail({ id }: { id: string }) {
  const options = useQuery('cleaning-options', loadOptions),
    [editing, setEditing] = useState<'edit' | 'copy' | null>(null),
    [deleting, setDeleting] = useState(false),
    [success, setSuccess] = useState('')
  const mutation = useMutation()
  const template = options.data?.templates.find((item) => item.id === id)
  useDetailCrumb(template?.name ?? '')
  if (!options.data || !template)
    return (
      <PageLayout header={<Heading level={1}>Fiche de ménage</Heading>}>
        {options.data ? (
          <Feedback error="Cette fiche n’existe plus." />
        ) : (
          <Loading error={options.error} retry={() => void options.refresh()} />
        )}
      </PageLayout>
    )
  const lots = options.data.lots.filter((lot) => template.lot_ids.includes(lot.id))
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Heading level={1}>{template.name}</Heading>
              {template.is_default && <Token label="Par défaut" color="blue" size="sm" />}
            </HStack>
            <Text>{pointsSummary(template.items)}</Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Supprimer" variant="destructive" onClick={() => setDeleting(true)} />
            <Button label="Dupliquer" onClick={() => setEditing('copy')} />
            <Button label="Modifier la fiche" variant="primary" onClick={() => setEditing('edit')} />
          </HStack>
        </HStack>
      }
    >
      <Feedback success={success} />
      {kinds.map((kind) => {
        const items = template.items.filter((item) => item.kind === kind)
        return (
          <List key={kind} hasDividers listStyle="decimal" header={<Heading level={2}>{kindTitles[kind]}</Heading>}>
            {items.length ? (
              items.map((item, index) => <ListItem key={index} label={item.label} />)
            ) : (
              <ListItem label="Aucun point." />
            )}
          </List>
        )
      })}
      <List hasDividers header={<Heading level={2}>Lots</Heading>}>
        {template.is_default && (
          <ListItem label="Tous les lots sans fiche spécifique" description="Fiche appliquée par défaut." />
        )}
        {lots.map((lot) => (
          <ListItem key={lot.id} label={lotLabel(lot)} href={'#lots/' + lot.id} />
        ))}
        {!template.is_default && !lots.length && (
          <ListItem
            label="Aucun lot"
            description="Choisissez les lots dans « Modifier la fiche » ou au moment de planifier."
          />
        )}
      </List>
      {editing && (
        <TemplateEditor
          template={editing === 'edit' ? template : undefined}
          source={editing === 'copy' ? template : undefined}
          options={options.data}
          close={() => setEditing(null)}
          saved={(saved) => {
            setEditing(null)
            if (saved !== template.id) window.location.hash = '#cleaning/fiches/' + saved
            else {
              setSuccess('Fiche enregistrée.')
              void options.refresh()
            }
          }}
        />
      )}
      {deleting && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !mutation.busy) setDeleting(false)
          }}
          title={'Supprimer la fiche « ' + template.name + ' » ?'}
          description={
            mutation.error ||
            (template.is_default
              ? 'C’est la fiche par défaut : les lots sans fiche spécifique seront planifiés sans checklist tant qu’aucune autre fiche n’est définie par défaut.'
              : options.data.templates.some((item) => item.is_default)
                ? 'Les lots rattachés reprendront la fiche par défaut.'
                : 'Aucune fiche par défaut : les lots rattachés seront planifiés sans checklist.') +
              ' Les tâches déjà planifiées conservent leur checklist.'
          }
          actionLabel="Supprimer la fiche"
          cancelLabel="Annuler"
          isActionLoading={mutation.busy}
          onAction={() =>
            void mutation.run(
              () => call((client) => client.cleaning.removeTemplate({ params: { id } })),
              () => {
                window.location.hash = '#cleaning/fiches'
              },
            )
          }
        />
      )}
    </PageLayout>
  )
}
