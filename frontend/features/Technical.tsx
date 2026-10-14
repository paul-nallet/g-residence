import type { Priority } from '../../src/domain/priority.ts'
import { PriorityField, PriorityFilter, PriorityToken, type PriorityFilterValue } from './priority.tsx'
import { useCallback, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Section } from '@astryxdesign/core/Section'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { parisDate, parisTime, today } from '../../src/domain/rules.ts'
import {
  type Intervention,
  type Issue,
  IssueStatus,
  type Location,
  PAGE_SIZE,
  type Place,
  type Supplier,
  type TechnicalOptions,
  type WorkActionKind,
  type WorkDetail as Work,
  WorkFilter,
  type WorkStatus,
  workStatusLabels,
  type WorkSummary,
} from '../../src/domain/technical.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { useHashPage, useHashParam } from '../lib/hashParams.ts'
import { Journal } from './journal.tsx'
import { DateField, dateLabel, Editor, Feedback, Loading, StateToken } from './shared.tsx'

type Tab = 'works' | 'issues' | 'suppliers' | 'places'
const tabs: { value: Tab; label: string; href: string }[] = [
  { value: 'works', label: 'Travaux', href: '#technical' },
  { value: 'issues', label: 'Signalements', href: '#technical/signalements' },
  { value: 'suppliers', label: 'Fournisseurs', href: '#technical/fournisseurs' },
  { value: 'places', label: 'Lieux', href: '#technical/lieux' },
]
const workColors = {
  to_plan: 'gray',
  planned: 'blue',
  in_progress: 'orange',
  done: 'green',
  cancelled: 'gray',
} as const
const issueLabels = { open: 'Ouvert', resolved: 'Résolu', dismissed: 'Classé sans suite' }
const issueColors = { open: 'orange', resolved: 'green', dismissed: 'gray' } as const
const noteLabels = { note: 'Note', problem: 'Problème', status: 'Suivi' }
const noteColors = { note: 'blue', problem: 'red', status: 'gray' } as const
const actionLabels: Record<WorkActionKind, { title: string; label: string; success: string }> = {
  start: { title: 'Démarrer le chantier', label: 'Démarrer', success: 'Chantier démarré.' },
  finish: { title: 'Terminer le chantier', label: 'Terminer', success: 'Chantier terminé.' },
  cancel: { title: 'Annuler le chantier', label: 'Annuler le chantier', success: 'Chantier annulé.' },
  reopen: { title: 'Rouvrir le chantier', label: 'Rouvrir', success: 'Chantier rouvert.' },
}
const loadOptions = () => call((client) => client.technical.options())
const loadBuildings = () => call((client) => client.buildings.list())
const instantLabel = (instant: string) => dateLabel(parisDate(instant)) + ' · ' + parisTime(instant)
const periodLabel = (start: string | null, end: string | null) =>
  start || end ? (start ? dateLabel(start) : '…') + ' → ' + (end ? dateLabel(end) : '…') : 'Non planifié'
const plural = (count: number, one: string, many: string) => count + ' ' + (count > 1 ? many : one)

function WorkToken({ status }: { status: WorkStatus }) {
  return <Token label={workStatusLabels[status]} color={workColors[status]} size="sm" />
}

function TechnicalTabs({ current }: { current: Tab }) {
  return (
    <TabList value={current} onChange={() => undefined}>
      {tabs.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} href={tab.href} />
      ))}
    </TabList>
  )
}

function TechnicalPage({
  current,
  actions,
  children,
}: {
  current: Tab
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Technique</Heading>
            <Text color="secondary">Signalements, travaux, interventions et prestataires de la résidence.</Text>
          </VStack>
          {actions}
        </HStack>
      }
      navigation={<TechnicalTabs current={current} />}
    >
      {children}
    </PageLayout>
  )
}

const locationOptions = (options: TechnicalOptions, extra: readonly Location[] = []) => {
  const groups = new Map<string, { value: string; label: string }[]>()
  for (const location of options.locations)
    groups.set(location.group, [...(groups.get(location.group) ?? []), { value: location.ref, label: location.label }])
  const archived = extra.filter((location) => !options.locations.some((item) => item.ref === location.ref))
  return [
    ...[...groups].map(([title, items]) => ({ type: 'section' as const, title, options: items })),
    ...(archived.length
      ? [
          {
            type: 'section' as const,
            title: 'Archivés',
            options: archived.map((location) => ({ value: location.ref, label: location.label })),
          },
        ]
      : []),
  ]
}

type CreatedPlace = { id: string; name: string; building: string }
type CreatedSupplier = { id: string; name: string; trades: string }
const noneCreated: TechnicalOptions = { locations: [], suppliers: [] }
const withCreated = (options: TechnicalOptions, created: TechnicalOptions): TechnicalOptions => ({
  locations: [
    ...options.locations,
    ...created.locations.filter((location) => !options.locations.some((item) => item.ref === location.ref)),
  ],
  suppliers: [
    ...options.suppliers,
    ...created.suppliers.filter((supplier) => !options.suppliers.some((item) => item.id === supplier.id)),
  ].toSorted((a, b) => a.name.localeCompare(b.name, 'fr')),
})
const placeOption = (place: CreatedPlace) => ({
  ref: 'place:' + place.id,
  label: place.name,
  group: place.building ? 'Lieu · ' + place.building : 'Lieu',
})

function WorkEditor({
  options,
  work,
  issue,
  close,
  saved,
}: {
  options: TechnicalOptions
  work?: Work
  issue?: Issue
  close: () => void
  saved: (id: string) => void
}) {
  const [title, setTitle] = useState(work?.title ?? issue?.title ?? ''),
    [description, setDescription] = useState(work?.description ?? issue?.description ?? ''),
    [priority, setPriority] = useState<Priority>(work?.priority ?? issue?.priority ?? 'normal'),
    [locations, setLocations] = useState<string[]>(
      work ? work.locations.map((location) => location.ref) : issue?.location ? [issue.location.ref] : [],
    ),
    [suppliers, setSuppliers] = useState<string[]>(work ? work.suppliers.map((supplier) => supplier.id) : []),
    [start, setStart] = useState(work?.planned_start ?? ''),
    [end, setEnd] = useState(work?.planned_end ?? ''),
    [created, setCreated] = useState(noneCreated),
    [nested, setNested] = useState<'place' | 'supplier' | null>(null)
  const mutation = useMutation()
  const all = withCreated(options, created)
  const extraSuppliers = (work?.suppliers ?? []).filter(
    (supplier) => !all.suppliers.some((item) => item.id === supplier.id),
  )
  const payload = {
    title,
    description,
    locations,
    supplier_ids: suppliers,
    priority,
    planned_start: start || null,
    planned_end: end || null,
  }
  return (
    <>
      <Editor
        title={work ? 'Modifier le chantier' : issue ? 'Créer des travaux depuis le signalement' : 'Nouveau chantier'}
        label={work ? 'Enregistrer' : 'Créer le chantier'}
        close={close}
        busy={mutation.busy}
        error={mutation.error}
        disabled={!title.trim() || !locations.length}
        submit={() => {
          let id = work?.id ?? ''
          void mutation.run(
            async () => {
              if (work) await call((client) => client.technical.updateWork({ params: { id: work.id }, payload }))
              else
                id = (
                  await call((client) =>
                    client.technical.createWork({
                      payload: issue ? { ...payload, issue_id: issue.id } : payload,
                    }),
                  )
                ).id
            },
            () => saved(id),
          )
        }}
      >
        <TextInput
          label="Titre"
          value={title}
          onChange={setTitle}
          isRequired
          hasAutoFocus
          placeholder="Remplacer le siphon, reprendre la peinture du hall…"
        />
        <TextArea label="Description" value={description} onChange={setDescription} isOptional maxLength={4000} />
        <PriorityField value={priority} onChange={setPriority} />
        <MultiSelector
          label="Lieux concernés"
          description="Les lots actifs sont des lieux ; ajoutez une partie commune si elle manque."
          options={locationOptions(all, work?.locations)}
          value={locations}
          onChange={setLocations}
          hasSearch
          searchPlaceholder="Rechercher un lot ou un lieu"
          placeholder="Aucun lieu choisi"
          emptyText="Aucun lieu actif."
          emptySearchText="Aucun lieu trouvé."
          triggerDisplay="badges"
        />
        <HStack>
          <Button label="Nouveau lieu" variant="ghost" size="sm" onClick={() => setNested('place')} />
        </HStack>
        <MultiSelector
          label="Fournisseurs"
          description="Facultatif tant que le chantier est à planifier."
          options={[
            ...all.suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name + (supplier.trades ? ' · ' + supplier.trades : ''),
            })),
            ...extraSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name + ' (archivé)' })),
          ]}
          value={suppliers}
          onChange={setSuppliers}
          hasSearch
          searchPlaceholder="Rechercher un fournisseur"
          placeholder="Aucun fournisseur"
          emptyText="Aucun fournisseur actif."
          emptySearchText="Aucun fournisseur trouvé."
          triggerDisplay="badges"
        />
        <HStack>
          <Button label="Nouveau fournisseur" variant="ghost" size="sm" onClick={() => setNested('supplier')} />
        </HStack>
        <HStack gap={3} wrap="wrap">
          <DateField label="Début prévu" value={start} onChange={setStart} optional />
          <DateField label="Fin prévue" value={end} onChange={setEnd} optional />
        </HStack>
        <Text color="secondary">
          Un chantier avec une date de début prévue passe de « À planifier » à « Planifié ».
        </Text>
      </Editor>
      {nested === 'place' && (
        <PlaceEditor
          close={() => setNested(null)}
          saved={(place) => {
            setNested(null)
            setCreated({ ...created, locations: [...created.locations, placeOption(place)] })
            setLocations([...locations, 'place:' + place.id])
          }}
        />
      )}
      {nested === 'supplier' && (
        <SupplierEditor
          close={() => setNested(null)}
          saved={(supplier) => {
            setNested(null)
            setCreated({ ...created, suppliers: [...created.suppliers, supplier] })
            setSuppliers([...suppliers, supplier.id])
          }}
        />
      )}
    </>
  )
}

function ActionEditor({
  work,
  action,
  close,
  saved,
}: {
  work: Work
  action: WorkActionKind
  close: () => void
  saved: () => void
}) {
  const dated = action === 'start' || action === 'finish'
  const [date, setDate] = useState(today()),
    [comment, setComment] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title={actionLabels[action].title}
      label={actionLabels[action].label}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={dated && !date}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.technical.actWork({
                params: { id: work.id },
                payload: { action, date: dated ? date : null, comment },
              }),
            ),
          saved,
        )
      }
    >
      <Text>{work.title}</Text>
      {dated && (
        <DateField label={action === 'start' ? 'Début réel' : 'Fin réelle'} value={date} onChange={setDate} past />
      )}
      {action === 'finish' && work.issues.some((issue) => issue.status === 'open') && (
        <Text color="secondary">Les signalements ouverts liés à ce chantier seront marqués résolus.</Text>
      )}
      <TextArea label="Commentaire pour le journal" value={comment} onChange={setComment} isOptional maxLength={2000} />
    </Editor>
  )
}

function NoteEditor({ work, close, saved }: { work: Work; close: () => void; saved: () => void }) {
  const [kind, setKind] = useState<'note' | 'problem'>('note'),
    [body, setBody] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title="Ajouter au journal"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!body.trim()}
      submit={() =>
        void mutation.run(
          () => call((client) => client.technical.addNote({ params: { id: work.id }, payload: { kind, body } })),
          saved,
        )
      }
    >
      <Selector
        label="Type"
        value={kind}
        onChange={(value) => setKind(value === 'problem' ? 'problem' : 'note')}
        options={[
          { value: 'note', label: 'Note d’avancement' },
          { value: 'problem', label: 'Problème rencontré' },
        ]}
      />
      <TextArea label="Texte" value={body} onChange={setBody} isRequired hasAutoFocus maxLength={2000} />
      <Text color="secondary">Le journal est daté et signé ; une entrée ne peut plus être modifiée.</Text>
    </Editor>
  )
}

function InterventionEditor({
  work,
  intervention,
  close,
  saved,
}: {
  work: Work
  intervention?: Intervention
  close: () => void
  saved: () => void
}) {
  const [localStart, setLocalStart] = useState(
      intervention
        ? `${parisDate(intervention.starts_at)}T${parisTime(intervention.starts_at)}`
        : (work.planned_start && work.planned_start > today() ? work.planned_start : today()) + 'T09:00',
    ),
    [duration, setDuration] = useState(intervention?.duration ?? 60),
    [supplier, setSupplier] = useState(intervention?.supplier_id ?? work.suppliers[0]?.id ?? ''),
    [status, setStatus] = useState(intervention?.status ?? 'planned'),
    [report, setReport] = useState(intervention?.report ?? '')
  const mutation = useMutation()
  const payload = { local_start: localStart, duration, supplier_id: supplier, status, report }
  return (
    <Editor
      title={intervention ? 'Modifier l’intervention' : 'Planifier une intervention'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!localStart}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              intervention
                ? client.technical.updateIntervention({ params: { id: intervention.id }, payload })
                : client.technical.createIntervention({ params: { id: work.id }, payload }),
            ),
          saved,
        )
      }
    >
      <Text>{work.title}</Text>
      <DateTimeInput
        label="Rendez-vous · heure de Paris"
        timeLabel="Heure du rendez-vous"
        value={localStart as ISODateTimeString}
        onChange={(value) => setLocalStart(value ?? '')}
        hourFormat="24h"
        presentation="native"
      />
      <NumberInput
        label="Durée"
        value={duration}
        onChange={setDuration}
        min={5}
        max={720}
        units="min"
        isIntegerOnly
        isWheelEnabled={false}
      />
      <Selector
        label="Fournisseur"
        description="Parmi les fournisseurs rattachés au chantier."
        value={supplier}
        onChange={setSupplier}
        options={[
          { value: '', label: 'Aucun fournisseur' },
          ...work.suppliers.map((item) => ({
            value: item.id,
            label: item.name + (item.archived ? ' (archivé)' : ''),
          })),
        ]}
      />
      <Selector
        label="État"
        value={status}
        onChange={(value) => setStatus(value === 'done' ? 'done' : value === 'cancelled' ? 'cancelled' : 'planned')}
        options={[
          { value: 'planned', label: 'Prévue' },
          { value: 'done', label: 'Réalisée' },
          { value: 'cancelled', label: 'Annulée' },
        ]}
      />
      <TextArea label="Compte rendu" value={report} onChange={setReport} isOptional maxLength={4000} />
      {status !== 'planned' && intervention?.status !== status && (
        <Text color="secondary">Le changement d’état sera inscrit au journal du chantier.</Text>
      )}
    </Editor>
  )
}

export function TechnicalWork({ id }: { id: string }) {
  const load = useCallback(() => call((client) => client.technical.work({ params: { id } })), [id]),
    result = useQuery('technical-work:' + id, load),
    options = useQuery('technical-options', loadOptions)
  const [dialog, setDialog] = useState<
      | { kind: 'edit' }
      | { kind: 'action'; action: WorkActionKind }
      | { kind: 'note' }
      | { kind: 'intervention'; intervention?: Intervention }
      | null
    >(null),
    [success, setSuccess] = useState('')
  useDetailCrumb(result.data?.title ?? '')
  if (!result.data)
    return (
      <PageLayout header={<Heading level={1}>Chantier</Heading>}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </PageLayout>
    )
  const work = result.data,
    closed = work.status === 'done' || work.status === 'cancelled'
  const done = (message: string) => {
    setDialog(null)
    setSuccess(message)
    void result.refresh()
    void options.refresh()
  }
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Heading level={1}>{work.title}</Heading>
              <WorkToken status={work.status} />
              <PriorityToken priority={work.priority} />
            </HStack>
            <Text color="secondary">{work.locations.map((location) => location.label).join(' · ')}</Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            {closed ? (
              <Button label="Rouvrir" onClick={() => setDialog({ kind: 'action', action: 'reopen' })} />
            ) : (
              <>
                {work.status !== 'in_progress' && (
                  <Button label="Démarrer" onClick={() => setDialog({ kind: 'action', action: 'start' })} />
                )}
                <Button
                  label="Terminer"
                  variant="primary"
                  onClick={() => setDialog({ kind: 'action', action: 'finish' })}
                />
              </>
            )}
            <MoreMenu
              label="Gérer le chantier"
              alignment="end"
              presentation="adaptive"
              isDisabled={!options.data}
              items={[
                { label: 'Modifier le chantier', onClick: () => setDialog({ kind: 'edit' }) },
                { label: 'Ajouter au journal', onClick: () => setDialog({ kind: 'note' }) },
                ...(closed
                  ? []
                  : [
                      { type: 'divider' as const },
                      {
                        label: 'Annuler le chantier',
                        variant: 'destructive' as const,
                        onClick: () => setDialog({ kind: 'action', action: 'cancel' }),
                      },
                    ]),
              ]}
            />
          </HStack>
        </HStack>
      }
    >
      <Feedback success={success} />
      <List hasDividers header={<Heading level={2}>Informations</Heading>}>
        <ListItem label="Dates prévues" description={periodLabel(work.planned_start, work.planned_end)} />
        <ListItem
          label="Dates réelles"
          description={work.actual_start ? periodLabel(work.actual_start, work.actual_end) : 'Pas encore démarré'}
        />
        {work.description && <ListItem label="Description" description={work.description} />}
        <ListItem
          label="Lieux"
          description={work.locations
            .map((location) => location.label + (location.archived ? ' (archivé)' : ''))
            .join(', ')}
        />
        {work.issues.map((issue) => (
          <ListItem
            key={issue.id}
            label={'Signalement · ' + issue.title}
            href={'#technical/signalements?statut=all&q=' + encodeURIComponent(issue.title)}
            endContent={<Token label={issueLabels[issue.status]} color={issueColors[issue.status]} size="sm" />}
          />
        ))}
      </List>
      <List hasDividers header={<Heading level={2}>Fournisseurs</Heading>}>
        {work.suppliers.length ? (
          work.suppliers.map((supplier) => (
            <ListItem
              key={supplier.id}
              label={supplier.name}
              href={'#technical/fournisseurs/' + supplier.id}
              description={[supplier.trades, supplier.phone, supplier.email].filter(Boolean).join(' · ')}
              endContent={supplier.archived ? <Token label="Archivé" color="gray" size="sm" /> : undefined}
            />
          ))
        ) : (
          <ListItem label="Aucun fournisseur rattaché." />
        )}
      </List>
      <VStack gap={3}>
        <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
          <Heading level={2}>Interventions</Heading>
          {closed ? (
            <Text color="secondary">Rouvrez le chantier pour planifier une intervention.</Text>
          ) : (
            <Button label="Planifier une intervention" onClick={() => setDialog({ kind: 'intervention' })} />
          )}
        </HStack>
        {work.interventions.length ? (
          <Table
            data={[...work.interventions]}
            idKey="id"
            dividers="rows"
            columns={[
              {
                key: 'starts_at',
                header: 'Rendez-vous',
                width: proportional(2),
                renderCell: (row) => (
                  <VStack gap={1}>
                    <Text>{instantLabel(row.starts_at)}</Text>
                    <Text type="supporting">{row.duration} min</Text>
                  </VStack>
                ),
              },
              {
                key: 'supplier',
                header: 'Fournisseur',
                width: proportional(2),
                renderCell: (row) => <Text>{row.supplier ?? '—'}</Text>,
              },
              {
                key: 'status',
                header: 'État',
                width: proportional(1),
                renderCell: (row) => <StateToken state={row.status} />,
              },
              {
                key: 'report',
                header: 'Compte rendu',
                width: proportional(3),
                renderCell: (row) => <Text maxLines={3}>{row.report || '—'}</Text>,
              },
              {
                key: 'actions',
                header: 'Actions',
                width: proportional(1),
                renderCell: (row) => (
                  <Button
                    label="Modifier"
                    aria-label={'Modifier l’intervention du ' + instantLabel(row.starts_at)}
                    onClick={() => setDialog({ kind: 'intervention', intervention: row })}
                  />
                ),
              },
            ]}
          />
        ) : (
          <Text>Aucune intervention. Planifiez un rendez-vous technique pour qu’il apparaisse au calendrier.</Text>
        )}
      </VStack>
      <Journal
        entries={work.notes.map((note) => ({
          ...note,
          tag: { label: noteLabels[note.kind], color: noteColors[note.kind] },
        }))}
        action={<Button label="Ajouter au journal" onClick={() => setDialog({ kind: 'note' })} />}
      />
      {dialog?.kind === 'edit' && options.data && (
        <WorkEditor
          options={options.data}
          work={work}
          close={() => setDialog(null)}
          saved={() => done('Chantier enregistré.')}
        />
      )}
      {dialog?.kind === 'action' && (
        <ActionEditor
          work={work}
          action={dialog.action}
          close={() => setDialog(null)}
          saved={() => done(actionLabels[dialog.action].success)}
        />
      )}
      {dialog?.kind === 'note' && (
        <NoteEditor work={work} close={() => setDialog(null)} saved={() => done('Journal complété.')} />
      )}
      {dialog?.kind === 'intervention' && (
        <InterventionEditor
          work={work}
          intervention={dialog.intervention}
          close={() => setDialog(null)}
          saved={() => done(dialog.intervention ? 'Intervention enregistrée.' : 'Intervention planifiée.')}
        />
      )}
    </PageLayout>
  )
}

function WorksTable({
  query,
  version = 0,
}: {
  query: { q?: string; status?: WorkFilter; location?: string; supplier?: string; priority?: Priority }
  version?: number
}) {
  const [page, setPage] = useState(1)
  const key = JSON.stringify(query)
  const load = useCallback(
    () => call((client) => client.technical.works({ query: { ...(JSON.parse(key) as typeof query), page } })),
    [key, page],
  )
  const result = useQuery(`technical-works:${key}:${page}:${version}`, load)
  const pagination = useTablePagination<WorkSummary>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: PAGE_SIZE,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des travaux',
  })
  if (!result.data) return <Loading error={result.error} retry={() => void result.refresh()} />
  if (!result.data.items.length) return <Text>Aucun chantier ne correspond à ces critères.</Text>
  return (
    <VStack gap={2}>
      <Text type="supporting">
        {plural(result.data.total, 'chantier', 'chantiers')} · {result.data.active} en cours ou à venir dans la
        résidence
      </Text>
      <Table
        data={[...result.data.items]}
        idKey="id"
        rowCount={result.data.total}
        rowIndexStart={(page - 1) * PAGE_SIZE + 1}
        plugins={{ pagination }}
        dividers="rows"
        columns={[
          {
            key: 'title',
            header: 'Chantier',
            width: proportional(3),
            renderCell: (row) => (
              <VStack gap={1}>
                <Link href={'#technical/travaux/' + row.id}>{row.title}</Link>
                <Text type="supporting" maxLines={2}>
                  {row.locations.join(', ')}
                </Text>
              </VStack>
            ),
          },
          {
            key: 'priority',
            header: 'Priorité',
            width: proportional(1),
            renderCell: (row) => <PriorityToken priority={row.priority} />,
          },
          {
            key: 'status',
            header: 'Statut',
            width: proportional(1),
            renderCell: (row) => <WorkToken status={row.status} />,
          },
          {
            key: 'planned_start',
            header: 'Dates',
            width: proportional(2),
            renderCell: (row) => (
              <Text>
                {row.actual_start
                  ? periodLabel(row.actual_start, row.actual_end)
                  : periodLabel(row.planned_start, row.planned_end)}
              </Text>
            ),
          },
          {
            key: 'suppliers',
            header: 'Fournisseurs',
            width: proportional(2),
            renderCell: (row) => <Text maxLines={2}>{row.suppliers.join(', ') || '—'}</Text>,
          },
          {
            key: 'next_intervention',
            header: 'Prochaine intervention',
            width: proportional(2),
            renderCell: (row) => <Text>{row.next_intervention ? instantLabel(row.next_intervention) : '—'}</Text>,
          },
        ]}
      />
    </VStack>
  )
}

const workDestinations = (work: WorkSummary): WorkStatus[] => {
  if (work.status === 'done' || work.status === 'cancelled')
    return [work.actual_start ? 'in_progress' : work.planned_start ? 'planned' : 'to_plan']
  return work.status === 'in_progress'
    ? ['done', 'cancelled']
    : [work.status === 'planned' ? 'to_plan' : 'planned', 'in_progress', 'done', 'cancelled']
}

function WorkMoveEditor({
  id,
  target,
  close,
  saved,
}: {
  id: string
  target: WorkStatus
  close: () => void
  saved: () => void
}) {
  const load = useCallback(() => call((client) => client.technical.work({ params: { id } })), [id])
  const result = useQuery('technical-work:' + id, load)
  const [date, setDate] = useState(today())
  const mutation = useMutation()
  if (!result.data)
    return (
      <Editor title="Déplacer le chantier" close={close} busy={false} error="" disabled submit={() => undefined}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </Editor>
    )
  const work = result.data
  if (!workDestinations({ ...work, locations: [], suppliers: [], next_intervention: null }).includes(target))
    return (
      <Editor title="Déplacement indisponible" close={close} busy={false} error="" disabled submit={() => undefined}>
        <Text>Le statut de ce chantier a changé. Fermez cette fenêtre et actualisez le tableau.</Text>
      </Editor>
    )
  const closed = work.status === 'done' || work.status === 'cancelled'
  if (closed || target === 'in_progress' || target === 'done' || target === 'cancelled')
    return (
      <ActionEditor
        work={work}
        action={closed ? 'reopen' : target === 'in_progress' ? 'start' : target === 'done' ? 'finish' : 'cancel'}
        close={close}
        saved={saved}
      />
    )
  return (
    <Editor
      title={'Déplacer vers « ' + workStatusLabels[target] + ' »'}
      label="Confirmer le déplacement"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={target === 'planned' && !date}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.technical.updateWork({
                params: { id },
                payload: {
                  title: work.title,
                  priority: work.priority,
                  description: work.description,
                  locations: work.locations.map((location) => location.ref),
                  supplier_ids: work.suppliers.map((supplier) => supplier.id),
                  planned_start: target === 'planned' ? date : null,
                  planned_end: work.planned_end,
                },
              }),
            ),
          saved,
        )
      }
    >
      <Text>{work.title}</Text>
      {target === 'planned' ? (
        <DateField label="Début prévu" value={date} onChange={setDate} />
      ) : (
        <Text>La date de début prévue sera retirée. La date de fin prévue est conservée.</Text>
      )}
    </Editor>
  )
}

function WorksColumn({
  query,
  status,
  version,
  dragged,
  onDrag,
  onDropAction,
  busy,
}: {
  dragged: WorkSummary | null
  onDrag: (work: WorkSummary | null) => void
  onDropAction: (id: string, target: WorkStatus) => void
  busy: boolean
  query: { q?: string; location?: string; supplier?: string; priority?: Priority }
  status: WorkStatus
  version: number
}) {
  const [page, setPage] = useState(1)
  const key = JSON.stringify(query)
  const load = useCallback(
    () => call((client) => client.technical.works({ query: { ...JSON.parse(key), status, page } })),
    [key, status, page],
  )
  const result = useQuery(`technical-works:${key}:${status}:${page}:${version}`, load)
  const closed = status === 'done' || status === 'cancelled'
  const accepts = !busy && dragged !== null && workDestinations(dragged).includes(status)
  const [over, setOver] = useState(false)
  return (
    <Section
      padding={3}
      variant={accepts && over ? 'muted' : 'transparent'}
      onDragOver={(event) => {
        if (!accepts) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        if (accepts && dragged) onDropAction(dragged.id, status)
        onDrag(null)
      }}
    >
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Heading level={2}>{workStatusLabels[status]}</Heading>
          {result.data && <Badge label={result.data.total} />}
        </HStack>
        {!result.data ? (
          <Loading error={result.error} retry={() => void result.refresh()} />
        ) : (
          <>
            {result.data.items.length ? (
              result.data.items.map((work) => (
                <Card
                  key={work.id}
                  padding={3}
                  draggable={!busy}
                  elevation={dragged?.id === work.id ? 'med' : 'none'}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', work.id)
                    onDrag(work)
                  }}
                  onDragEnd={() => {
                    onDrag(null)
                    setOver(false)
                  }}
                >
                  <VStack gap={3}>
                    <HStack gap={2} vAlign="start">
                      <StackItem size="fill">
                        <VStack gap={1}>
                          <Link
                            href={'#technical/travaux/' + work.id}
                            draggable={false}
                            isStandalone
                            color="primary"
                            weight="semibold"
                            maxLines={2}
                          >
                            {work.title}
                          </Link>
                          <Text type="supporting" maxLines={2}>
                            {work.locations.join(' · ')}
                          </Text>
                        </VStack>
                      </StackItem>
                      <MoreMenu
                        label={'Déplacer le chantier ' + work.title}
                        size="sm"
                        alignment="end"
                        presentation="adaptive"
                        isDisabled={busy}
                        items={workDestinations(work).map((target) => ({
                          label: 'Déplacer vers « ' + workStatusLabels[target] + ' »',
                          onClick: () => onDropAction(work.id, target),
                        }))}
                      />
                    </HStack>
                    <HStack gap={2} wrap="wrap">
                      <PriorityToken priority={work.priority} />
                    </HStack>
                    {(work.suppliers.length > 0 || work.planned_start || work.planned_end || work.actual_end) && (
                      <VStack gap={1}>
                        {work.suppliers.length > 0 && (
                          <Text type="supporting" maxLines={1}>
                            {work.suppliers.join(' · ')}
                          </Text>
                        )}
                        {work.status === 'done' && work.actual_end ? (
                          <Text type="supporting">Terminé le {dateLabel(work.actual_end)}</Text>
                        ) : work.planned_start && work.planned_end ? (
                          <Text type="supporting">{periodLabel(work.planned_start, work.planned_end)}</Text>
                        ) : work.planned_start ? (
                          <Text type="supporting">Début prévu · {dateLabel(work.planned_start)}</Text>
                        ) : work.planned_end ? (
                          <Text type="supporting">Fin prévue · {dateLabel(work.planned_end)}</Text>
                        ) : null}
                      </VStack>
                    )}
                    {work.next_intervention ? (
                      <HStack gap={2} wrap="wrap">
                        <Token label={'Intervention · ' + instantLabel(work.next_intervention)} size="sm" />
                      </HStack>
                    ) : !closed ? (
                      <Text type="supporting" color="secondary">
                        Intervention à prévoir
                      </Text>
                    ) : null}
                    {!closed && work.planned_end && work.planned_end < today() && (
                      <HStack gap={2} wrap="wrap">
                        <Token label="Fin prévue dépassée" color="red" size="sm" />
                      </HStack>
                    )}
                  </VStack>
                </Card>
              ))
            ) : (
              <Text color="secondary">Aucun chantier.</Text>
            )}
            {result.data.total > PAGE_SIZE && (
              <HStack gap={2} wrap="wrap" vAlign="center">
                <Button
                  label="Précédent"
                  aria-label={'Page précédente · ' + workStatusLabels[status]}
                  size="sm"
                  isDisabled={page === 1}
                  onClick={() => setPage(page - 1)}
                />
                <Text type="supporting">
                  {page} / {Math.ceil(result.data.total / PAGE_SIZE)}
                </Text>
                <Button
                  label="Suivant"
                  aria-label={'Page suivante · ' + workStatusLabels[status]}
                  size="sm"
                  isDisabled={page * PAGE_SIZE >= result.data.total}
                  onClick={() => setPage(page + 1)}
                />
              </HStack>
            )}
          </>
        )}
      </VStack>
    </Section>
  )
}

const workFilterLabels: Record<WorkFilter, string> = { active: 'En cours et à venir', all: 'Tous', ...workStatusLabels }

export function TechnicalWorks() {
  const [q, setQ] = useHashParam('q', ''),
    [status, setStatus] = useHashParam<WorkFilter>('statut', 'active'),
    [priority, setPriority] = useHashParam<PriorityFilterValue>('priorite', 'all'),
    [view, setView] = useHashParam('vue', 'tableau'),
    [location, setLocation] = useHashParam('lieu', ''),
    [supplier, setSupplier] = useHashParam('fournisseur', ''),
    [creating, setCreating] = useState(false),
    [version, setVersion] = useState(0),
    [dragged, setDragged] = useState<WorkSummary | null>(null),
    [move, setMove] = useState<{ id: string; target: WorkStatus } | null>(null),
    [success, setSuccess] = useState('')
  const options = useQuery('technical-options', loadOptions)
  const onDropAction = useCallback((id: string, target: WorkStatus) => {
    setDragged(null)
    setSuccess('')
    setMove({ id, target })
  }, [])
  const query = {
    ...(q.trim() ? { q } : {}),
    status,
    ...(location ? { location } : {}),
    ...(supplier ? { supplier } : {}),
    ...(priority !== 'all' ? { priority } : {}),
  }
  return (
    <TechnicalPage
      current="works"
      actions={
        <Button
          label="Nouveau chantier"
          variant="primary"
          isDisabled={!options.data}
          onClick={() => setCreating(true)}
        />
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="end">
        <TextInput label="Rechercher" value={q} onChange={setQ} hasClear placeholder="Titre, lieu, fournisseur" />
        <PriorityFilter value={priority} onChange={setPriority} />
        <Selector
          label="Statut"
          value={status}
          onChange={(value) => setStatus(WorkFilter.literals.find((item) => item === value) ?? 'active')}
          options={WorkFilter.literals.map((value) => ({ value, label: workFilterLabels[value] }))}
        />
        <Selector
          label="Lieu"
          value={location}
          onChange={(value) => setLocation(value ?? '')}
          hasClear
          hasSearch
          searchPlaceholder="Rechercher un lieu"
          placeholder="Tous les lieux"
          options={options.data ? locationOptions(options.data) : []}
        />
        <Selector
          label="Fournisseur"
          value={supplier}
          onChange={(value) => setSupplier(value ?? '')}
          hasClear
          placeholder="Tous les fournisseurs"
          options={(options.data?.suppliers ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
      </HStack>
      <Feedback success={success} />
      <TabList value={view === 'liste' ? 'liste' : 'tableau'} onChange={setView}>
        <Tab value="tableau" label="Tableau" />
        <Tab value="liste" label="Liste" />
      </TabList>
      {view === 'liste' ? (
        <WorksTable key={JSON.stringify(query)} query={query} version={version} />
      ) : (
        <Layout height="auto" padding={0}>
          <LayoutContent>
            <Grid columns={{ minWidth: 280, max: 5 }} gap={4} align="stretch">
              {(['to_plan', 'planned', 'in_progress', 'done', 'cancelled'] as const)
                .filter(
                  (column) => status === 'all' || (status === 'active' ? column !== 'cancelled' : column === status),
                )
                .map((column) => (
                  <WorksColumn
                    key={JSON.stringify(query) + column}
                    query={query}
                    status={column}
                    version={version}
                    dragged={dragged}
                    onDrag={setDragged}
                    busy={move !== null}
                    onDropAction={onDropAction}
                  />
                ))}
            </Grid>
          </LayoutContent>
        </Layout>
      )}
      {move && (
        <WorkMoveEditor
          key={move.id + move.target}
          id={move.id}
          target={move.target}
          close={() => setMove(null)}
          saved={() => {
            setMove(null)
            setVersion((value) => value + 1)
            setSuccess('Chantier déplacé.')
          }}
        />
      )}
      {creating && options.data && (
        <WorkEditor
          options={options.data}
          close={() => setCreating(false)}
          saved={(id) => {
            setCreating(false)
            setVersion(version + 1)
            window.location.hash = 'technical/travaux/' + id
          }}
        />
      )}
    </TechnicalPage>
  )
}

function IssueEditor({
  options,
  issue,
  close,
  saved,
}: {
  options: TechnicalOptions
  issue?: Issue
  close: () => void
  saved: () => void
}) {
  const [title, setTitle] = useState(issue?.title ?? ''),
    [description, setDescription] = useState(issue?.description ?? ''),
    [priority, setPriority] = useState<Priority>(issue?.priority ?? 'normal'),
    [reported, setReported] = useState(issue?.reported_on ?? today()),
    [location, setLocation] = useState(issue?.location?.ref ?? ''),
    [status, setStatus] = useState(issue?.status ?? 'open'),
    [created, setCreated] = useState(noneCreated),
    [nested, setNested] = useState(false)
  const mutation = useMutation()
  const payload = { title, description, reported_on: reported, location, status, priority }
  return (
    <>
      <Editor
        title={issue ? 'Modifier le signalement' : 'Signaler un problème'}
        close={close}
        busy={mutation.busy}
        error={mutation.error}
        disabled={!title.trim() || !reported}
        submit={() =>
          void mutation.run(
            () =>
              call((client) =>
                issue
                  ? client.technical.updateIssue({ params: { id: issue.id }, payload })
                  : client.technical.createIssue({ payload }),
              ),
            saved,
          )
        }
      >
        <TextInput
          label="Titre"
          value={title}
          onChange={setTitle}
          isRequired
          hasAutoFocus
          placeholder="Capot manquant, trace au mur, fuite…"
        />
        <TextArea label="Description" value={description} onChange={setDescription} isOptional maxLength={2000} />
        <PriorityField value={priority} onChange={setPriority} />
        <DateField label="Constaté le" value={reported} onChange={setReported} past />
        <Selector
          label="Lieu"
          description="Sans lieu, le signalement concerne les parties communes en général."
          value={location}
          onChange={(value) => setLocation(value ?? '')}
          hasClear
          hasSearch
          searchPlaceholder="Rechercher un lot ou un lieu"
          placeholder="Parties communes (général)"
          options={locationOptions(withCreated(options, created), issue?.location ? [issue.location] : [])}
        />
        <HStack>
          <Button label="Nouveau lieu" variant="ghost" size="sm" onClick={() => setNested(true)} />
        </HStack>
        {issue && (
          <Selector
            label="État"
            value={status}
            onChange={(value) => setStatus(IssueStatus.literals.find((item) => item === value) ?? 'open')}
            options={IssueStatus.literals.map((value) => ({ value, label: issueLabels[value] }))}
          />
        )}
      </Editor>
      {nested && (
        <PlaceEditor
          close={() => setNested(false)}
          saved={(place) => {
            setNested(false)
            setCreated({ ...created, locations: [...created.locations, placeOption(place)] })
            setLocation('place:' + place.id)
          }}
        />
      )}
    </>
  )
}

export function TechnicalIssues() {
  const [q, setQ] = useHashParam('q', ''),
    [status, setStatus] = useHashParam<'all' | IssueStatus>('statut', 'open'),
    [priority, setPriority] = useHashParam<PriorityFilterValue>('priorite', 'all'),
    [page, setPage] = useHashPage(),
    [dialog, setDialog] = useState<{ kind: 'issue'; issue?: Issue } | { kind: 'work'; issue: Issue } | null>(null),
    [success, setSuccess] = useState('')
  const options = useQuery('technical-options', loadOptions)
  const load = useCallback(
    () =>
      call((client) =>
        client.technical.issues({
          query: { ...(q.trim() ? { q } : {}), ...(priority !== 'all' ? { priority } : {}), status, page },
        }),
      ),
    [q, status, priority, page],
  )
  const result = useQuery(`technical-issues:${q}:${status}:${priority}:${page}`, load)
  const pagination = useTablePagination<Issue>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: PAGE_SIZE,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des signalements',
  })
  return (
    <TechnicalPage
      current="issues"
      actions={
        <Button
          label="Signaler un problème"
          variant="primary"
          isDisabled={!options.data}
          onClick={() => setDialog({ kind: 'issue' })}
        />
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="end">
        <TextInput
          label="Rechercher"
          value={q}
          onChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          hasClear
          placeholder="Titre, description, lieu"
        />
        <PriorityFilter
          value={priority}
          onChange={(value) => {
            setPriority(value)
            setPage(1)
          }}
        />
        <Selector
          label="État"
          value={status}
          onChange={(value) => {
            setStatus(value === 'all' ? 'all' : (IssueStatus.literals.find((item) => item === value) ?? 'open'))
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'Tous' },
            ...IssueStatus.literals.map((value) => ({ value, label: issueLabels[value] })),
          ]}
        />
      </HStack>
      <Feedback success={success} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.items.length ? (
        <VStack gap={2}>
          <Text type="supporting">
            {plural(result.data.total, 'signalement', 'signalements')} · {result.data.open} ouvert
            {result.data.open > 1 ? 's' : ''} dans la résidence
          </Text>
          <Table
            data={[...result.data.items]}
            idKey="id"
            rowCount={result.data.total}
            rowIndexStart={(page - 1) * PAGE_SIZE + 1}
            plugins={{ pagination }}
            dividers="rows"
            columns={[
              {
                key: 'title',
                header: 'Signalement',
                width: proportional(3),
                renderCell: (row) => (
                  <VStack gap={1}>
                    <Text type="label">{row.title}</Text>
                    {row.description && (
                      <Text type="supporting" maxLines={2}>
                        {row.description}
                      </Text>
                    )}
                  </VStack>
                ),
              },
              {
                key: 'location',
                header: 'Lieu',
                width: proportional(2),
                renderCell: (row) =>
                  row.location ? (
                    row.location.ref.startsWith('lot:') ? (
                      <Link href={'#lots/' + row.location.ref.slice(4)}>{row.location.label}</Link>
                    ) : (
                      <Text>{row.location.label}</Text>
                    )
                  ) : (
                    <Text color="secondary">Parties communes</Text>
                  ),
              },
              {
                key: 'reported_on',
                header: 'Constaté le',
                width: proportional(1),
                renderCell: (row) => (
                  <VStack gap={1}>
                    <Text>{dateLabel(row.reported_on)}</Text>
                    <Text type="supporting">{row.actor}</Text>
                  </VStack>
                ),
              },
              {
                key: 'priority',
                header: 'Priorité',
                width: proportional(1),
                renderCell: (row) => <PriorityToken priority={row.priority} />,
              },
              {
                key: 'status',
                header: 'État',
                width: proportional(1),
                renderCell: (row) => (
                  <Token label={issueLabels[row.status]} color={issueColors[row.status]} size="sm" />
                ),
              },
              {
                key: 'work_id',
                header: 'Travaux',
                width: proportional(2),
                renderCell: (row) =>
                  row.work_id ? (
                    <Link href={'#technical/travaux/' + row.work_id}>{row.work_title}</Link>
                  ) : row.status === 'open' ? (
                    <Button
                      label="Créer des travaux"
                      aria-label={'Créer des travaux pour ' + row.title}
                      size="sm"
                      isDisabled={!options.data}
                      onClick={() => setDialog({ kind: 'work', issue: row })}
                    />
                  ) : (
                    <Text color="secondary">—</Text>
                  ),
              },
              {
                key: 'actions',
                header: 'Actions',
                width: proportional(1),
                renderCell: (row) => (
                  <Button
                    label="Modifier"
                    aria-label={'Modifier le signalement ' + row.title}
                    size="sm"
                    isDisabled={!options.data}
                    onClick={() => setDialog({ kind: 'issue', issue: row })}
                  />
                ),
              },
            ]}
          />
        </VStack>
      ) : (
        <Text>Aucun signalement ne correspond à ces critères.</Text>
      )}
      {dialog?.kind === 'issue' && options.data && (
        <IssueEditor
          options={options.data}
          issue={dialog.issue}
          close={() => setDialog(null)}
          saved={() => {
            setDialog(null)
            setSuccess(dialog.issue ? 'Signalement modifié.' : 'Signalement enregistré.')
            void result.refresh()
          }}
        />
      )}
      {dialog?.kind === 'work' && options.data && (
        <WorkEditor
          options={options.data}
          issue={dialog.issue}
          close={() => setDialog(null)}
          saved={(id) => {
            setDialog(null)
            window.location.hash = 'technical/travaux/' + id
          }}
        />
      )}
    </TechnicalPage>
  )
}

function SupplierEditor({
  supplier,
  close,
  saved,
}: {
  supplier?: Supplier
  close: () => void
  saved: (supplier: CreatedSupplier) => void
}) {
  const [name, setName] = useState(supplier?.name ?? ''),
    [trades, setTrades] = useState(supplier?.trades ?? ''),
    [contact, setContact] = useState(supplier?.contact ?? ''),
    [phone, setPhone] = useState(supplier?.phone ?? ''),
    [email, setEmail] = useState(supplier?.email ?? ''),
    [notes, setNotes] = useState(supplier?.notes ?? ''),
    [archived, setArchived] = useState(supplier?.archived ?? false)
  const mutation = useMutation()
  const payload = { name, trades, contact, phone, email, notes, archived }
  return (
    <Editor
      title={supplier ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim()}
      submit={() => {
        let id = supplier?.id ?? ''
        void mutation.run(
          async () => {
            id = (
              await call((client) =>
                supplier
                  ? client.technical.updateSupplier({ params: { id: supplier.id }, payload })
                  : client.technical.createSupplier({ payload }),
              )
            ).id
          },
          () => saved({ id, name: name.trim(), trades: trades.trim() }),
        )
      }}
    >
      <TextInput label="Nom" value={name} onChange={setName} isRequired hasAutoFocus />
      <TextInput label="Métiers" value={trades} onChange={setTrades} isOptional placeholder="Plomberie, électricité…" />
      <TextInput label="Contact" value={contact} onChange={setContact} isOptional />
      <HStack gap={3} wrap="wrap">
        <TextInput label="Téléphone" value={phone} onChange={setPhone} isOptional />
        <TextInput label="Email" value={email} onChange={setEmail} isOptional type="email" />
      </HStack>
      <TextArea label="Notes" value={notes} onChange={setNotes} isOptional maxLength={2000} />
      {supplier && (
        <CheckboxInput
          label="Fournisseur archivé"
          description="Il n’est plus proposé mais reste visible sur les travaux passés."
          value={archived}
          onChange={setArchived}
        />
      )}
    </Editor>
  )
}

export function TechnicalSuppliers() {
  const [q, setQ] = useState(''),
    [archived, setArchived] = useState<'no' | 'yes'>('no'),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState<Supplier | 'new' | null>(null),
    [success, setSuccess] = useState('')
  const load = useCallback(
    () => call((client) => client.technical.suppliers({ query: { ...(q.trim() ? { q } : {}), archived, page } })),
    [q, archived, page],
  )
  const result = useQuery(`technical-suppliers:${q}:${archived}:${page}`, load)
  const pagination = useTablePagination<Supplier>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: PAGE_SIZE,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des fournisseurs',
  })
  return (
    <TechnicalPage
      current="suppliers"
      actions={<Button label="Ajouter un fournisseur" variant="primary" onClick={() => setEditor('new')} />}
    >
      <HStack gap={3} wrap="wrap" vAlign="end">
        <TextInput
          label="Rechercher"
          value={q}
          onChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          hasClear
          placeholder="Nom, métier, contact"
        />
        <Selector
          label="Fournisseurs affichés"
          value={archived}
          onChange={(value) => {
            setArchived(value === 'yes' ? 'yes' : 'no')
            setPage(1)
          }}
          options={[
            { value: 'no', label: 'Actifs' },
            { value: 'yes', label: 'Archivés' },
          ]}
        />
      </HStack>
      <Feedback success={success} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.items.length ? (
        <Table
          data={[...result.data.items]}
          idKey="id"
          rowCount={result.data.total}
          rowIndexStart={(page - 1) * PAGE_SIZE + 1}
          plugins={{ pagination }}
          dividers="rows"
          columns={[
            {
              key: 'name',
              header: 'Fournisseur',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Link href={'#technical/fournisseurs/' + row.id}>{row.name}</Link>
                  {row.trades && <Text type="supporting">{row.trades}</Text>}
                </VStack>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              width: proportional(3),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text>{row.contact || '—'}</Text>
                  {(row.phone || row.email) && (
                    <Text type="supporting">{[row.phone, row.email].filter(Boolean).join(' · ')}</Text>
                  )}
                </VStack>
              ),
            },
            {
              key: 'active_works',
              header: 'Chantiers actifs',
              width: proportional(1),
              renderCell: (row) => (row.active_works ? <Badge label={row.active_works} /> : <Text>—</Text>),
            },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(1),
              renderCell: (row) => (
                <Button label="Modifier" aria-label={'Modifier ' + row.name} size="sm" onClick={() => setEditor(row)} />
              ),
            },
          ]}
        />
      ) : (
        <Text>
          {archived === 'yes' || q
            ? 'Aucun fournisseur ne correspond à ces critères.'
            : 'Aucun fournisseur enregistré.'}
        </Text>
      )}
      {editor && (
        <SupplierEditor
          supplier={editor === 'new' ? undefined : editor}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null)
            setSuccess(editor === 'new' ? 'Fournisseur ajouté.' : 'Fournisseur modifié.')
            void result.refresh()
          }}
        />
      )}
    </TechnicalPage>
  )
}

export function TechnicalSupplier({ id }: { id: string }) {
  const load = useCallback(() => call((client) => client.technical.supplier({ params: { id } })), [id]),
    result = useQuery('technical-supplier:' + id, load),
    [editing, setEditing] = useState(false),
    [success, setSuccess] = useState('')
  useDetailCrumb(result.data?.name ?? '')
  if (!result.data)
    return (
      <PageLayout header={<Heading level={1}>Fournisseur</Heading>}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </PageLayout>
    )
  const supplier = result.data
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Heading level={1}>{supplier.name}</Heading>
              {supplier.archived && <Token label="Archivé" color="gray" size="sm" />}
            </HStack>
            {supplier.trades && <Text color="secondary">{supplier.trades}</Text>}
          </VStack>
          <Button label="Modifier" onClick={() => setEditing(true)} />
        </HStack>
      }
    >
      <Feedback success={success} />
      <List hasDividers header={<Heading level={2}>Coordonnées</Heading>}>
        <ListItem label="Contact" description={supplier.contact || 'Non renseigné'} />
        <ListItem
          label="Téléphone"
          description={supplier.phone || 'Non renseigné'}
          href={supplier.phone ? 'tel:' + supplier.phone.replace(/\s/g, '') : undefined}
        />
        <ListItem
          label="Email"
          description={supplier.email || 'Non renseigné'}
          href={supplier.email ? 'mailto:' + supplier.email : undefined}
        />
        {supplier.notes && <ListItem label="Notes" description={supplier.notes} />}
      </List>
      <Heading level={2}>Travaux</Heading>
      <WorksTable query={{ status: 'all', supplier: supplier.id }} />
      {editing && (
        <SupplierEditor
          supplier={supplier}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false)
            setSuccess('Fournisseur modifié.')
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}

function PlaceEditor({
  place,
  close,
  saved,
}: {
  place?: Place
  close: () => void
  saved: (place: CreatedPlace) => void
}) {
  const [name, setName] = useState(place?.name ?? ''),
    [building, setBuilding] = useState(place?.building_id ?? ''),
    [description, setDescription] = useState(place?.description ?? ''),
    [archived, setArchived] = useState(place?.archived ?? false)
  const buildings = useQuery('buildings', loadBuildings)
  const mutation = useMutation()
  const payload = { name, building_id: building, description, archived }
  return (
    <Editor
      title={place ? 'Modifier le lieu' : 'Ajouter un lieu'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim()}
      submit={() => {
        let id = place?.id ?? ''
        void mutation.run(
          async () => {
            id = (
              await call((client) =>
                place
                  ? client.technical.updatePlace({ params: { id: place.id }, payload })
                  : client.technical.createPlace({ payload }),
              )
            ).id
          },
          () =>
            saved({
              id,
              name: name.trim(),
              building: buildings.data?.find((item) => item.id === building)?.name ?? '',
            }),
        )
      }}
    >
      <TextInput
        label="Nom"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Hall, chaufferie, toiture…"
      />
      <Selector
        label="Bâtiment"
        value={building}
        onChange={(value) => setBuilding(value ?? '')}
        hasClear
        isOptional
        placeholder="Aucun bâtiment"
        options={(buildings.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
      />
      <TextArea label="Description" value={description} onChange={setDescription} isOptional maxLength={500} />
      {place && (
        <CheckboxInput
          label="Lieu archivé"
          description="Il n’est plus proposé mais reste visible sur l’historique des travaux."
          value={archived}
          onChange={setArchived}
        />
      )}
    </Editor>
  )
}

const loadPlaces = () => call((client) => client.technical.places())

export function TechnicalPlaces() {
  const result = useQuery('technical-places', loadPlaces),
    [editor, setEditor] = useState<Place | 'new' | null>(null),
    [success, setSuccess] = useState('')
  return (
    <TechnicalPage
      current="places"
      actions={<Button label="Ajouter un lieu" variant="primary" onClick={() => setEditor('new')} />}
    >
      <Text color="secondary">
        Chaque lot actif est déjà un lieu. Ajoutez ici les parties communes et locaux techniques.
      </Text>
      <Feedback success={success} />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.length ? (
        <Table
          data={[...result.data]}
          idKey="id"
          dividers="rows"
          columns={[
            {
              key: 'name',
              header: 'Lieu',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Link href={'#technical?lieu=' + encodeURIComponent('place:' + row.id)}>{row.name}</Link>
                  {row.description && (
                    <Text type="supporting" maxLines={2}>
                      {row.description}
                    </Text>
                  )}
                </VStack>
              ),
            },
            {
              key: 'building_name',
              header: 'Bâtiment',
              width: proportional(1),
              renderCell: (row) => <Text>{row.building_name || '—'}</Text>,
            },
            {
              key: 'active_works',
              header: 'Chantiers actifs',
              width: proportional(1),
              renderCell: (row) => (row.active_works ? <Badge label={row.active_works} /> : <Text>—</Text>),
            },
            {
              key: 'open_issues',
              header: 'Signalements ouverts',
              width: proportional(1),
              renderCell: (row) =>
                row.open_issues ? <Badge variant="warning" label={row.open_issues} /> : <Text>—</Text>,
            },
            {
              key: 'archived',
              header: 'État',
              width: proportional(1),
              renderCell: (row) => (
                <Token label={row.archived ? 'Archivé' : 'Actif'} color={row.archived ? 'gray' : 'green'} size="sm" />
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(1),
              renderCell: (row) => (
                <Button label="Modifier" aria-label={'Modifier ' + row.name} size="sm" onClick={() => setEditor(row)} />
              ),
            },
          ]}
        />
      ) : (
        <Text>Aucun lieu commun enregistré.</Text>
      )}
      {editor && (
        <PlaceEditor
          place={editor === 'new' ? undefined : editor}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null)
            setSuccess(editor === 'new' ? 'Lieu ajouté.' : 'Lieu modifié.')
            void result.refresh()
          }}
        />
      )}
    </TechnicalPage>
  )
}
