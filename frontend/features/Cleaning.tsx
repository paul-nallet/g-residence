import type { Priority } from '../../src/domain/priority.ts'
import { PriorityField, PriorityFilter, PriorityToken, type PriorityFilterValue } from './priority.tsx'
import { useCallback, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
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
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ArrowDown, ArrowUp, MessageSquareText, Trash2 } from 'lucide-react'
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
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { useHashParam } from '../lib/hashParams.ts'
import { DateField, dateLabel, Editor, Feedback, Loading, PeriodNav, roleLabels, StateToken } from './shared.tsx'

const stateLabels: Record<CleaningItemKind, Record<CleaningItemState, string>> = {
  task: { todo: 'À faire', done: 'Fait', issue: 'Non fait' },
  check: { todo: 'À vérifier', done: 'Conforme', issue: 'Anomalie' },
}
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
const plural = (count: number, one: string, many: string) => count + ' ' + (count > 1 ? many : one)
const pointsSummary = (items: readonly { kind: CleaningItemKind }[]) => {
  const tasks = items.filter((item) => item.kind === 'task').length
  return plural(tasks, 'tâche', 'tâches') + ' · ' + plural(items.length - tasks, 'vérification', 'vérifications')
}
const loadOptions = () => call((client) => client.cleaning.options())
const noOptions = () => Promise.resolve(null)

function CleaningTabs({ current }: { current: 'planning' | 'templates' }) {
  return (
    <TabList value={current} onChange={() => undefined}>
      <Tab value="planning" label="Planning" href="#cleaning" />
      <Tab value="templates" label="Fiches" href="#cleaning/fiches" />
    </TabList>
  )
}

function PlanEditor({
  options,
  day,
  lotIds = [],
  close,
  saved,
}: {
  options: CleaningOptions
  day: string
  lotIds?: readonly string[]
  close: () => void
  saved: (count: number) => void
}) {
  const [lots, setLots] = useState<string[]>([...lotIds]),
    [agent, setAgent] = useState(options.agents[0]?.id ?? ''),
    [date, setDate] = useState(day),
    [template, setTemplate] = useState(''),
    [priority, setPriority] = useState<Priority>('normal'),
    [note, setNote] = useState('')
  const mutation = useMutation()
  const fallback = options.templates.find((item) => item.is_default)
  const applied = (lotId: string) => {
    if (template === 'none') return 'sans checklist'
    const lot = options.lots.find((item) => item.id === lotId)
    const chosen = options.templates.find((item) => item.id === (template || lot?.template_id || fallback?.id || ''))
    return chosen ? chosen.name : 'sans checklist'
  }
  return (
    <Editor
      title="Planifier un ménage"
      label={lots.length > 1 ? 'Planifier ' + lots.length + ' lots' : 'Planifier'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!lots.length || !agent || !date}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.cleaning.create({
                payload: { lot_ids: lots, agent_id: agent, day: date, template_id: template, note, priority },
              }),
            ),
          () => saved(lots.length),
        )
      }
    >
      <MultiSelector
        label="Lots"
        description="Une tâche est créée pour chaque lot choisi."
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
      <Selector
        label="Agent"
        value={agent}
        onChange={setAgent}
        options={options.agents.map((item) => ({
          value: item.id,
          label: item.name,
          description: roleLabels[item.role],
        }))}
      />
      <DateField label="Jour" value={date} onChange={setDate} />
      <PriorityField value={priority} onChange={setPriority} />
      <Selector
        label="Fiche de ménage"
        value={template || 'lot'}
        onChange={(value) => setTemplate(value === 'lot' ? '' : value)}
        options={[
          { value: 'lot', label: 'Fiche habituelle de chaque lot' },
          ...options.templates.map((item) => ({ value: item.id, label: item.name })),
          { value: 'none', label: 'Sans checklist' },
        ]}
      />
      {lots.length > 0 && (
        <Text color="secondary">
          {lots
            .map((id) => {
              const lot = options.lots.find((item) => item.id === id)
              return (lot ? 'Lot ' + lot.number : 'Lot') + ' : ' + applied(id)
            })
            .join(' · ')}
        </Text>
      )}
      <TextArea
        label="Consigne pour l’agent"
        value={note}
        onChange={setNote}
        isOptional
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

function RescheduleEditor({
  date,
  tasks,
  close,
  saved,
}: {
  date: string
  tasks: readonly CleaningTask[]
  close: () => void
  saved: (count: number, day: string) => void
}) {
  const [ids, setIds] = useState(tasks.map((task) => task.id)),
    [day, setDay] = useState(addDays(date, 1))
  const mutation = useMutation()
  return (
    <Editor
      title={'Reporter des ménages du ' + dayLabel(date)}
      label={ids.length > 1 ? 'Reporter ' + ids.length + ' lots' : 'Reporter'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!ids.length || !day || day === date}
      submit={() =>
        void mutation.run(
          () => call((client) => client.cleaning.reschedule({ payload: { task_ids: ids, day } })),
          () => saved(ids.length, day),
        )
      }
    >
      <CheckboxList label="Lots à reporter" value={ids} onChange={setIds} hasDividers density="compact">
        {tasks.map((task) => (
          <CheckboxListItem
            key={task.id}
            value={task.id}
            label={lotLabel({ number: task.lot_number, building_name: task.building_name })}
            description={task.agent_name + ' · ' + (task.template_name || 'Sans fiche')}
          />
        ))}
      </CheckboxList>
      <DateField label="Nouveau jour" value={day} onChange={setDay} />
      <Text color="secondary">
        Seuls les ménages prévus se reportent ; l’agent, la consigne et la checklist sont conservés.
      </Text>
    </Editor>
  )
}

function TaskList({
  date,
  tasks,
  reschedule,
}: {
  date: string
  tasks: readonly CleaningTask[]
  reschedule?: (date: string, tasks: readonly CleaningTask[]) => void
}) {
  const movable = tasks.filter((task) => task.status === 'planned')
  return (
    <List
      hasDividers
      header={
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} vAlign="center">
            <Heading level={2}>{dayLabel(date)}</Heading>
            {date === today() && <Token label="Aujourd’hui" color="blue" size="sm" />}
          </HStack>
          {reschedule && movable.length > 0 && (
            <Button
              label="Reporter"
              aria-label={'Reporter des ménages du ' + dayLabel(date)}
              size="sm"
              onClick={() => reschedule(date, movable)}
            />
          )}
        </HStack>
      }
    >
      {tasks.length ? (
        tasks.map((task) => (
          <ListItem
            key={task.id}
            label={lotLabel({ number: task.lot_number, building_name: task.building_name })}
            href={'#cleaning/' + task.id}
            description={[
              task.agent_name,
              task.template_name || 'Sans fiche',
              task.total ? task.handled + '/' + task.total + ' points traités' : '',
              task.note,
            ]
              .filter(Boolean)
              .join(' · ')}
            endContent={
              <HStack gap={2} vAlign="center" wrap="wrap">
                <PriorityToken priority={task.priority} />
                {task.issues > 0 && (
                  <Token label={plural(task.issues, 'anomalie', 'anomalies')} color="orange" size="sm" />
                )}
                <CommentIcon comments={taskComments(task)} />
                <StateToken state={task.status} />
              </HStack>
            }
          />
        ))
      ) : (
        <ListItem label="Aucun ménage prévu." />
      )}
    </List>
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
              renderCell: (task) => (
                <HStack gap={2} vAlign="center">
                  <Text>{task.total ? task.handled + '/' + task.total : '—'}</Text>
                  {task.issues > 0 && (
                    <Token label={plural(task.issues, 'anomalie', 'anomalies')} color="orange" size="sm" />
                  )}
                  <CommentIcon comments={taskComments(task)} />
                </HStack>
              ),
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
          saved={(count) => {
            setPlanning(false)
            setSuccess(count > 1 ? count + ' tâches planifiées.' : 'Tâche planifiée.')
            setPage(1)
            void result.refresh()
          }}
        />
      )}
    </>
  )
}

export function Cleaning({ me }: { me: Me }) {
  const manager = me.role !== 'cleaner'
  const [date, setDate] = useHashParam('date', today()),
    [agent, setAgent] = useHashParam('agent', ''),
    [priority, setPriority] = useState<PriorityFilterValue>('all'),
    [view, setView] = useHashParam('vue', manager ? 'week' : 'day'),
    [planning, setPlanning] = useState(false),
    [moving, setMoving] = useState<{ date: string; tasks: readonly CleaningTask[] } | null>(null),
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
  const options = useQuery<CleaningOptions | null>(manager ? 'cleaning-options' : '', manager ? loadOptions : noOptions)
  const tasks = result.data ?? []
  const active = tasks.filter((task) => task.status !== 'cancelled')
  const done = active.filter((task) => task.status === 'done').length
  const issues = active.reduce((sum, task) => sum + task.issues, 0)
  const reschedule = manager
    ? (day: string, list: readonly CleaningTask[]) => setMoving({ date: day, tasks: list })
    : undefined
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Ménage</Heading>
            <Text color="secondary">
              {manager
                ? 'Planning des agents, checklist de chaque lot et suivi de la réalisation.'
                : 'Vos lots à nettoyer et leur checklist.'}
            </Text>
          </VStack>
          {manager && (
            <Button
              label="Planifier un ménage"
              variant="primary"
              isDisabled={!options.data}
              onClick={() => setPlanning(true)}
            />
          )}
        </HStack>
      }
      navigation={manager ? <CleaningTabs current="planning" /> : undefined}
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
          <DateField
            label="Aller à la date"
            labelHidden
            value={date}
            onChange={(value) => {
              if (value) setDate(value)
            }}
          />
          {manager && options.data && (
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
      <Feedback success={success} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : !week ? (
        <TaskList date={date} tasks={tasks} reschedule={reschedule} />
      ) : tasks.length ? (
        [...new Set(tasks.map((task) => task.day))].map((day) => (
          <TaskList key={day} date={day} tasks={tasks.filter((task) => task.day === day)} reschedule={reschedule} />
        ))
      ) : (
        <Text>Aucun ménage prévu cette semaine.</Text>
      )}
      {moving && (
        <RescheduleEditor
          date={moving.date}
          tasks={moving.tasks}
          close={() => setMoving(null)}
          saved={(count, day) => {
            setMoving(null)
            setSuccess((count > 1 ? count + ' ménages reportés' : 'Ménage reporté') + ' au ' + dayLabel(day) + '.')
            void result.refresh()
          }}
        />
      )}
      {planning && options.data && (
        <PlanEditor
          options={options.data}
          day={date}
          close={() => setPlanning(false)}
          saved={(count) => {
            setPlanning(false)
            setSuccess(count > 1 ? count + ' tâches planifiées.' : 'Tâche planifiée.')
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
      <Selector
        label="Agent"
        value={agent}
        onChange={setAgent}
        options={options.agents.map((item) => ({
          value: item.id,
          label: item.name,
          description: roleLabels[item.role],
        }))}
      />
      <DateField label="Jour" value={day} onChange={setDay} />
      <PriorityField value={priority} onChange={setPriority} />
      <TextArea label="Consigne pour l’agent" value={note} onChange={setNote} isOptional />
    </Editor>
  )
}

function PointEditor({ taskId, close, saved }: { taskId: string; close: () => void; saved: () => void }) {
  const [kind, setKind] = useState<CleaningItemKind>('task'),
    [label, setLabel] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title="Ajouter un point à cette tâche"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!label.trim()}
      submit={() =>
        void mutation.run(
          () => call((client) => client.cleaning.addItem({ params: { id: taskId }, payload: { kind, label } })),
          saved,
        )
      }
    >
      <Selector
        label="Type"
        value={kind}
        onChange={(value) => setKind(value as CleaningItemKind)}
        options={[
          { value: 'task', label: 'À faire' },
          { value: 'check', label: 'À vérifier' },
        ]}
      />
      <TextInput label="Intitulé" value={label} onChange={setLabel} isRequired hasAutoFocus />
      <Text color="secondary">Le point est ajouté à cette tâche uniquement ; la fiche n’est pas modifiée.</Text>
    </Editor>
  )
}

function IssueEditor({ item, close, saved }: { item: CleaningItem; close: () => void; saved: () => void }) {
  const [note, setNote] = useState(item.state === 'issue' ? item.note : '')
  const mutation = useMutation()
  const title = item.kind === 'task' ? 'Tâche non faite' : 'Signaler une anomalie'
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
        label={item.kind === 'task' ? 'Raison' : 'Constat'}
        value={note}
        onChange={setNote}
        isOptional
        hasAutoFocus
        placeholder={item.kind === 'task' ? 'Produit manquant, accès impossible…' : 'Ampoule grillée, trace au mur…'}
      />
    </Editor>
  )
}

function FinishEditor({ task, close, saved }: { task: CleaningTask; close: () => void; saved: () => void }) {
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
          ? task.handled +
            '/' +
            task.total +
            ' points traités' +
            (task.issues ? ', dont ' + plural(task.issues, 'anomalie', 'anomalies') : '') +
            '.'
          : 'Cette tâche n’a pas de checklist.'}
      </Text>
      <TextArea label="Commentaire" value={report} onChange={setReport} isOptional hasAutoFocus />
    </Editor>
  )
}

function Checklist({
  title,
  kind,
  items,
  editable,
  manager,
  busy,
  setState,
  report,
  remove,
}: {
  title: string
  kind: CleaningItemKind
  items: readonly CleaningItem[]
  editable: boolean
  manager: boolean
  busy: boolean
  setState: (item: CleaningItem, state: CleaningItemState) => void
  report: (item: CleaningItem) => void
  remove: (item: CleaningItem) => void
}) {
  const list = items.filter((item) => item.kind === kind)
  if (!list.length) return null
  return (
    <List hasDividers header={<Heading level={2}>{title}</Heading>}>
      {list.map((item) => (
        <ListItem
          key={item.id}
          label={item.label}
          startContent={
            <CheckboxInput
              label={(kind === 'task' ? 'Fait : ' : 'Conforme : ') + item.label}
              isLabelHidden
              value={item.state === 'done'}
              isReadOnly={!editable}
              isDisabled={busy}
              onChange={(checked) => setState(item, checked ? 'done' : 'todo')}
            />
          }
          description={
            stateLabels[kind][item.state] +
            (item.state === 'issue' && item.note ? ' : ' + item.note : '') +
            (item.state !== 'todo' && item.updated_by && item.updated_at
              ? ' · ' + item.updated_by + ', ' + timeLabel(item.updated_at)
              : '')
          }
          endContent={
            <HStack gap={2} vAlign="center">
              {item.note && <CommentIcon comments={[stateLabels[kind].issue + ' : ' + item.note]} />}
              {item.state === 'issue' && <Token label={stateLabels[kind].issue} color="orange" size="sm" />}
              {editable && (
                <MoreMenu
                  label={'Autres actions pour ' + item.label}
                  alignment="end"
                  presentation="adaptive"
                  isDisabled={busy}
                  items={[
                    {
                      label: kind === 'task' ? 'Marquer non fait' : 'Signaler une anomalie',
                      onClick: () => report(item),
                    },
                    ...(item.state !== 'todo'
                      ? [
                          {
                            label: 'Remettre ' + stateLabels[kind].todo.toLowerCase(),
                            onClick: () => setState(item, 'todo'),
                          },
                        ]
                      : []),
                    ...(manager
                      ? [
                          { type: 'divider' as const },
                          { label: 'Retirer ce point', variant: 'destructive' as const, onClick: () => remove(item) },
                        ]
                      : []),
                  ]}
                />
              )}
            </HStack>
          }
        />
      ))}
    </List>
  )
}

export function CleaningTaskDetail({ id, me }: { id: string; me: Me }) {
  const manager = me.role !== 'cleaner'
  const load = useCallback(() => call((client) => client.cleaning.task({ params: { id } })), [id]),
    detail = useQuery('cleaning-task:' + id, load),
    options = useQuery<CleaningOptions | null>(manager ? 'cleaning-options' : '', manager ? loadOptions : noOptions)
  const [dialog, setDialog] = useState<'edit' | 'point' | 'finish' | 'cancel' | null>(null),
    [issue, setIssue] = useState<CleaningItem | null>(null),
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
  const items = detail.data.items
  const editable = task.status === 'planned'
  const remaining = task.total - task.handled
  const refreshed = (message: string) => {
    setDialog(null)
    setIssue(null)
    setSuccess(message)
    void detail.refresh()
  }
  const run = (action: () => Promise<unknown>, message: string) => void mutation.run(action, () => refreshed(message))
  const setState = (item: CleaningItem, state: CleaningItemState) =>
    run(() => call((client) => client.cleaning.item({ params: { id: item.id }, payload: { state, note: '' } })), '')
  const status = (next: 'planned' | 'cancelled', message: string) =>
    run(
      () => call((client) => client.cleaning.status({ params: { id }, payload: { status: next, report: '' } })),
      message,
    )
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={1}>{lotLabel({ number: task.lot_number, building_name: task.building_name })}</Heading>
              <StateToken state={task.status} />
              <PriorityToken priority={task.priority} />
            </HStack>
            <Text>
              {dayLabel(task.day)} · {task.agent_name} · {task.template_name || 'Sans fiche'}
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            {manager && editable && (
              <MoreMenu
                label="Gérer la tâche"
                alignment="end"
                presentation="adaptive"
                isDisabled={mutation.busy || !options.data}
                items={[
                  { label: 'Modifier la tâche', onClick: () => setDialog('edit') },
                  { label: 'Ajouter un point', onClick: () => setDialog('point') },
                  { type: 'divider' },
                  { label: 'Annuler la tâche', variant: 'destructive', onClick: () => setDialog('cancel') },
                ]}
              />
            )}
            {manager && task.status === 'done' && (
              <Button label="Rouvrir" isLoading={mutation.busy} onClick={() => status('planned', 'Tâche rouverte.')} />
            )}
            {manager && task.status === 'cancelled' && (
              <Button label="Rétablir" isLoading={mutation.busy} onClick={() => status('planned', 'Tâche rétablie.')} />
            )}
            <Button label="Voir le lot" href={'#lots/' + task.lot_id} />
            {editable && (
              <Button
                label="Terminer"
                variant="primary"
                isDisabled={remaining > 0 || mutation.busy}
                tooltip={remaining > 0 ? 'Il reste ' + plural(remaining, 'point', 'points') + ' à traiter.' : undefined}
                onClick={() => setDialog('finish')}
              />
            )}
          </HStack>
        </HStack>
      }
    >
      <Feedback error={mutation.error} success={success} />
      {task.note && (
        <VStack gap={1}>
          <Heading level={2}>Consigne</Heading>
          <Text>{task.note}</Text>
        </VStack>
      )}
      {task.status === 'done' && task.completed_at && (
        <Text>
          Terminé par {task.completed_by} le {timeLabel(task.completed_at)}
          {task.report ? ' · ' + task.report : ''}
        </Text>
      )}
      {task.total > 0 ? (
        <ProgressBar
          label="Points traités"
          value={task.handled}
          max={task.total}
          hasValueLabel
          formatValueLabel={(value, max) => value + '/' + max}
          variant={task.status === 'done' ? 'success' : 'accent'}
        />
      ) : (
        <Text>Aucune checklist pour cette tâche.</Text>
      )}
      {(['task', 'check'] as const).map((kind) => (
        <Checklist
          key={kind}
          title={kind === 'task' ? 'À faire' : 'À vérifier'}
          kind={kind}
          items={items}
          editable={editable}
          manager={manager}
          busy={mutation.busy}
          setState={setState}
          report={setIssue}
          remove={(item) =>
            run(() => call((client) => client.cleaning.removeItem({ params: { id: item.id } })), 'Point retiré.')
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
      {dialog === 'point' && (
        <PointEditor taskId={task.id} close={() => setDialog(null)} saved={() => refreshed('Point ajouté.')} />
      )}
      {dialog === 'finish' && (
        <FinishEditor task={task} close={() => setDialog(null)} saved={() => refreshed('Ménage terminé.')} />
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
      {issue && <IssueEditor item={issue} close={() => setIssue(null)} saved={() => refreshed('Point signalé.')} />}
    </PageLayout>
  )
}

type Row = { key: string; kind: CleaningItemKind; label: string }

function TemplateEditor({
  template,
  options,
  close,
  saved,
}: {
  template?: CleaningTemplate
  options: CleaningOptions
  close: () => void
  saved: (id: string) => void
}) {
  const [name, setName] = useState(template?.name ?? ''),
    [isDefault, setIsDefault] = useState(template?.is_default ?? !options.templates.some((item) => item.is_default)),
    [rows, setRows] = useState<Row[]>((template?.items ?? []).map((item) => ({ ...item, key: crypto.randomUUID() }))),
    [lots, setLots] = useState<string[]>([...(template?.lot_ids ?? [])])
  const mutation = useMutation()
  const add = (kind: CleaningItemKind) =>
    setRows((current) => [...current, { key: crypto.randomUUID(), kind, label: '' }])
  const change = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const move = (index: number, offset: number) =>
    setRows((current) => {
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(index + offset, 0, row!)
      return next
    })
  const elsewhere = (lotId: string) =>
    options.templates.find((item) => item.id !== template?.id && item.lot_ids.includes(lotId))
  return (
    <Editor
      title={template ? 'Modifier la fiche' : 'Nouvelle fiche de ménage'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim() || rows.some((row) => !row.label.trim())}
      submit={() =>
        void mutation.run(async () => {
          const payload = {
            name,
            is_default: isDefault,
            items: rows.map(({ kind, label }) => ({ kind, label })),
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
      <VStack gap={3}>
        <Heading level={3}>Points de la fiche</Heading>
        {rows.length === 0 && <Text color="secondary">Ajoutez les tâches à faire et les points à vérifier.</Text>}
        {rows.map((row, index) => (
          <HStack key={row.key} gap={2} vAlign="center">
            <Selector
              label={'Type du point ' + (index + 1)}
              isLabelHidden
              value={row.kind}
              onChange={(value) => change(row.key, { kind: value as CleaningItemKind })}
              options={[
                { value: 'task', label: 'À faire' },
                { value: 'check', label: 'À vérifier' },
              ]}
            />
            <StackItem size="fill">
              <TextInput
                label={'Intitulé du point ' + (index + 1)}
                isLabelHidden
                width="100%"
                value={row.label}
                onChange={(value) => change(row.key, { label: value })}
                placeholder={row.kind === 'task' ? 'Aspirer les sols' : 'Ampoules fonctionnelles'}
              />
            </StackItem>
            <IconButton
              label={'Monter le point ' + (index + 1)}
              icon={<Icon icon={ArrowUp} />}
              variant="ghost"
              isDisabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <IconButton
              label={'Descendre le point ' + (index + 1)}
              icon={<Icon icon={ArrowDown} />}
              variant="ghost"
              isDisabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            />
            <IconButton
              label={'Supprimer le point ' + (index + 1)}
              icon={<Icon icon={Trash2} />}
              variant="ghost"
              onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
            />
          </HStack>
        ))}
        <HStack gap={2} wrap="wrap">
          <Button label="Ajouter une tâche" onClick={() => add('task')} />
          <Button label="Ajouter une vérification" onClick={() => add('check')} />
        </HStack>
      </VStack>
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
    [editing, setEditing] = useState(false),
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
            <Button label="Modifier la fiche" variant="primary" onClick={() => setEditing(true)} />
          </HStack>
        </HStack>
      }
    >
      <Feedback success={success} />
      {(['task', 'check'] as const).map((kind) => {
        const items = template.items.filter((item) => item.kind === kind)
        return (
          <List
            key={kind}
            hasDividers
            listStyle="decimal"
            header={<Heading level={2}>{kind === 'task' ? 'À faire' : 'À vérifier'}</Heading>}
          >
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
          template={template}
          options={options.data}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false)
            setSuccess('Fiche enregistrée.')
            void options.refresh()
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
            'Les lots rattachés reprendront la fiche par défaut. Les tâches déjà planifiées conservent leur checklist.'
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
