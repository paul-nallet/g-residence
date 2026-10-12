import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Token } from '@astryxdesign/core/Token'
import {
  frequencyLabels,
  pointStateLabels,
  type VisitFrequency,
  type VisitTemplateSummary,
  type VisitSummary,
  type VisitPoint,
  type VisitPointState,
} from '../../src/domain/visits.ts'
import { today, toTSV } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { useHashParam } from '../lib/hashParams.ts'
import { DateField, dateLabel, Editor, Feedback, Loading, StateToken } from './shared.tsx'

const loadBuildings = () => call((c) => c.buildings.list())
const visitHref = (id: string) => '#visits/' + id
const go = (id: string) => {
  window.location.hash = visitHref(id)
}
const statusOptions = [
  { value: 'all', label: 'Toutes' },
  { value: 'planned', label: 'Prévues' },
  { value: 'done', label: 'Réalisées' },
  { value: 'cancelled', label: 'Annulées' },
]
const frequencies = Object.entries(frequencyLabels).map(([value, label]) => ({ value, label }))
export function VisitsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>{title}</Heading>
            <Text color="secondary">{description}</Text>
          </VStack>
          {actions}
        </HStack>
      }
    >
      {children}
    </PageLayout>
  )
}

function BuildingFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const buildings = useQuery('buildings', loadBuildings)
  return (
    <Selector
      label="Bâtiment"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      options={[
        { value: '', label: 'Tous les bâtiments' },
        ...(buildings.data ?? []).map((b) => ({ value: b.id, label: b.name })),
      ]}
    />
  )
}

export function TechnicalVisits() {
  const [building, setBuilding] = useHashParam('batiment', ''),
    [status, setStatus] = useHashParam('statut', 'all'),
    [q, setQ] = useHashParam('q', ''),
    [view, setView] = useHashParam('vue', 'visites'),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [plan, setPlan] = useState<VisitTemplateSummary | null>(null),
    [schedule, setSchedule] = useState<VisitTemplateSummary | null>(null)
  const load = useCallback(
    () =>
      call((c) =>
        c.visits.list({ query: { building, status: status as 'all' | 'planned' | 'done' | 'cancelled', q, page } }),
      ),
    [building, status, q, page],
  )
  const result = useQuery(`visits:${building}:${status}:${q}:${page}`, load)
  const pagination = useTablePagination<VisitSummary>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des visites',
  })
  return (
    <VisitsPage
      title="Visites techniques"
      description="Contrôler les bâtiments, noter les anomalies et suivre les prochaines visites."
      actions={
        <HStack gap={2} wrap="wrap">
          <Button
            label={view === 'echeances' ? 'Voir les visites' : 'Voir les échéances'}
            onClick={() => {
              setView(view === 'echeances' ? 'visites' : 'echeances')
              setPage(1)
            }}
          />
          <Button label="Modèles" href="#visits/templates" />
          <Button label="Planifier une visite" variant="primary" onClick={() => setCreate(true)} />
        </HStack>
      }
    >
      <Layout
        content={
          <LayoutContent>
            <VStack gap={4}>
              {view === 'echeances' ? (
                <VisitDue building={building} setBuilding={setBuilding} plan={setPlan} schedule={setSchedule} />
              ) : (
                <>
                  <HStack gap={3} wrap="wrap">
                    <BuildingFilter
                      value={building}
                      onChange={(v) => {
                        setBuilding(v)
                        setPage(1)
                      }}
                    />
                    <Selector
                      label="Statut"
                      value={status}
                      onChange={(v) => {
                        setStatus(v ?? 'all')
                        setPage(1)
                      }}
                      options={statusOptions}
                    />
                    <TextInput
                      label="Rechercher"
                      value={q}
                      onChange={(v) => {
                        setQ(v)
                        setPage(1)
                      }}
                      hasClear
                    />
                  </HStack>
                  {!result.data ? (
                    <Loading error={result.error} retry={() => void result.refresh()} />
                  ) : result.data.total === 0 ? (
                    <Text>Aucune visite. Planifiez votre première tournée pour commencer le suivi du bâtiment.</Text>
                  ) : (
                    <Table
                      data={[...result.data.items]}
                      idKey="id"
                      rowCount={result.data.total}
                      rowIndexStart={(page - 1) * 20 + 1}
                      dividers="rows"
                      plugins={{ pagination }}
                      columns={[
                        {
                          key: 'name',
                          header: 'Visite',
                          width: proportional(3),
                          renderCell: (v) => <Link href={visitHref(v.id)}>{v.name}</Link>,
                        },
                        { key: 'building', header: 'Bâtiment', width: proportional(2) },
                        {
                          key: 'scheduled_on',
                          header: 'Date',
                          width: proportional(2),
                          renderCell: (v) => (
                            <VStack gap={1}>
                              <Text>{dateLabel(v.completed_on ?? v.scheduled_on)}</Text>
                              {v.status === 'planned' && v.scheduled_on < today() && (
                                <Token label="En retard" color="orange" size="sm" />
                              )}
                            </VStack>
                          ),
                        },
                        {
                          key: 'status',
                          header: 'Statut',
                          width: proportional(2),
                          renderCell: (v) => <StateToken state={v.status} />,
                        },
                        {
                          key: 'handled',
                          header: 'Points traités',
                          width: proportional(2),
                          renderCell: (v) => (
                            <Text>
                              {v.handled}/{v.total} · {v.anomalies} anomalie(s)
                            </Text>
                          ),
                        },
                      ]}
                    />
                  )}
                </>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      {create && <NewVisitEditor buildingId={building} close={() => setCreate(false)} />}
      {plan && <PlanEditor model={plan} close={() => setPlan(null)} />}
      {schedule && (
        <ScheduleEditor
          schedule={schedule}
          close={() => {
            setSchedule(null)
          }}
        />
      )}
    </VisitsPage>
  )
}

function VisitDue({
  building,
  setBuilding,
  plan,
  schedule,
}: {
  building: string
  setBuilding: (v: string) => void
  plan: (v: VisitTemplateSummary) => void
  schedule: (v: VisitTemplateSummary) => void
}) {
  const [page, setPage] = useState(1)
  const load = useCallback(() => call((c) => c.visits.templates({ query: { building, page } })), [building, page])
  const result = useQuery(`visit-due:${building}:${page}`, load)
  const pagination = useTablePagination<VisitTemplateSummary>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des échéances',
  })
  return (
    <VStack gap={4}>
      <BuildingFilter
        value={building}
        onChange={(v) => {
          setBuilding(v)
          setPage(1)
        }}
      />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.total === 0 ? (
        <Text>Les prochaines échéances apparaîtront après avoir planifié une visite récurrente.</Text>
      ) : (
        <Table
          data={[...result.data.items]}
          idKey="id"
          rowCount={result.data.total}
          rowIndexStart={(page - 1) * 20 + 1}
          dividers="rows"
          plugins={{ pagination }}
          columns={[
            { key: 'name', header: 'Tournée', width: proportional(3) },
            { key: 'building', header: 'Bâtiment', width: proportional(2) },
            {
              key: 'frequency',
              header: 'Fréquence',
              width: proportional(2),
              renderCell: (v) => (
                <Button label={frequencyLabels[v.frequency]} size="sm" variant="ghost" onClick={() => schedule(v)} />
              ),
            },
            {
              key: 'last_completed',
              header: 'Dernière visite',
              width: proportional(2),
              renderCell: (v) => <Text>{v.last_completed ? dateLabel(v.last_completed) : 'Aucune'}</Text>,
            },
            {
              key: 'next_due',
              header: 'Prochaine échéance',
              width: proportional(2),
              renderCell: (v) => (
                <VStack gap={1}>
                  <Text>{v.next_due ? dateLabel(v.next_due) : 'À la demande'}</Text>
                  {v.next_due && v.next_due < today() && <Token label="Échéance dépassée" color="orange" size="sm" />}
                  {v.planned_on && <Text type="supporting">Prévue le {dateLabel(v.planned_on)}</Text>}
                </VStack>
              ),
            },
            {
              key: 'id',
              header: 'Actions',
              width: proportional(2),
              align: 'end',
              renderCell: (v) =>
                v.planned_id ? (
                  <Button label="Ouvrir" size="sm" href={visitHref(v.planned_id)} />
                ) : (
                  <Button label="Planifier la prochaine" size="sm" onClick={() => plan(v)} />
                ),
            },
          ]}
        />
      )}
      <Text type="supporting">
        La fréquence part de la dernière visite réalisée. La prochaine tournée reprend les mêmes points à contrôler.
      </Text>
    </VStack>
  )
}

export const startingPoints = [
  { zone: 'Hall et accès', label: 'État des portes et accès', location: null },
  { zone: 'Hall et accès', label: 'Éclairage des communs', location: null },
  { zone: 'Circulations', label: 'État des sols et murs', location: null },
  { zone: 'Circulations', label: 'Encombrement des circulations', location: null },
  { zone: 'Locaux communs', label: 'Traces de fuite ou d’humidité', location: null },
  { zone: 'Locaux communs', label: 'Dégradations visibles', location: null },
]
function NewVisitEditor({ buildingId, close }: { buildingId: string; close: () => void }) {
  const [step, setStep] = useState(0),
    [building, setBuilding] = useState(buildingId),
    [name, setName] = useState('Visite technique'),
    [frequency, setFrequency] = useState<VisitFrequency>('monthly'),
    [day, setDay] = useState(today()),
    [points, setPoints] = useState(startingPoints),
    mutation = useMutation()
  const buildings = useQuery('buildings', loadBuildings)
  const valid =
    !!building && !!day && !!name.trim() && points.length > 0 && points.every((p) => p.zone.trim() && p.label.trim())
  return (
    <Editor
      title={step === 0 ? 'Planifier une visite' : 'Points à contrôler'}
      label={step === 0 ? 'Choisir les points' : 'Planifier la visite'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={step === 0 ? !building || !day || !name.trim() : !valid}
      submit={() => {
        if (step === 0) setStep(1)
        else
          void mutation.run(async () => {
            const visit = await call((c) =>
              c.visits.createDirect({ payload: { name, building_id: building, frequency, scheduled_on: day, points } }),
            )
            go(visit.id)
          })
      }}
    >
      {step === 0 ? (
        <>
          <Selector
            label="Bâtiment à visiter"
            value={building}
            onChange={(v) => setBuilding(v ?? '')}
            options={(buildings.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
          {buildings.error && <Feedback error={buildings.error} />}
          {buildings.data?.length === 0 && <Text>Ajoutez d’abord un bâtiment depuis Lots et mouvements.</Text>}
          <TextInput label="Titre de la visite" value={name} onChange={setName} isRequired />
          <DateField label="Jour prévu" value={day} onChange={setDay} />
          <Selector
            label="Fréquence"
            value={frequency}
            onChange={(v) => setFrequency(v as VisitFrequency)}
            options={frequencies}
          />
          <Text type="supporting">
            Mensuelle par défaut. Une visite ponctuelle convient après un incident ou des travaux.
          </Text>
        </>
      ) : (
        <>
          <Button label="Modifier le bâtiment ou la date" variant="ghost" onClick={() => setStep(0)} />
          <Text>
            Une liste de départ pour les observations visuelles. Adaptez-la au bâtiment ; elle sera reprise aux visites
            suivantes.
          </Text>
          {points.map((p, i) => (
            <VStack key={i} gap={2}>
              <TextInput
                label={'Zone du point ' + (i + 1)}
                value={p.zone}
                onChange={(zone) => setPoints(points.map((point, j) => (j === i ? { ...point, zone } : point)))}
              />
              <TextInput
                label={'Point ' + (i + 1) + ' à contrôler'}
                value={p.label}
                onChange={(label) => setPoints(points.map((point, j) => (j === i ? { ...point, label } : point)))}
              />
              <Button
                label={'Retirer le point ' + (i + 1)}
                variant="ghost"
                size="sm"
                onClick={() => setPoints(points.filter((_, j) => j !== i))}
              />
            </VStack>
          ))}
          <Button
            label="Ajouter un point"
            onClick={() => setPoints([...points, { zone: points.at(-1)?.zone ?? '', label: '', location: null }])}
            isDisabled={points.length >= 50}
          />
        </>
      )}
    </Editor>
  )
}

function ScheduleEditor({ schedule, close }: { schedule: VisitTemplateSummary; close: () => void }) {
  const [frequency, setFrequency] = useState(schedule.frequency),
    mutation = useMutation()
  return (
    <Editor
      title="Fréquence des prochaines visites"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(async () => {
          const existing = await call((c) => c.visits.template({ params: { id: schedule.id } }))
          await call((c) =>
            c.visits.updateTemplate({
              params: { id: schedule.id },
              payload: {
                name: existing.name,
                building_id: existing.building_id,
                frequency,
                first_due: existing.first_due ?? today(),
                archived: false,
                points: existing.points,
              },
            }),
          )
        }, close)
      }
    >
      <Text>
        {schedule.name} · {schedule.building}
      </Text>
      <Selector
        label="Fréquence"
        value={frequency}
        onChange={(v) => setFrequency(v as VisitFrequency)}
        options={frequencies}
      />
      <Text type="supporting">
        Les visites déjà planifiées gardent leur date. Ponctuelle arrête les échéances récurrentes.
      </Text>
    </Editor>
  )
}

function PlanEditor({
  model,
  visit,
  close,
}: {
  model?: VisitTemplateSummary
  visit?: VisitSummary
  close: () => void
}) {
  const [day, setDay] = useState(visit?.scheduled_on ?? model?.next_due ?? today()),
    mutation = useMutation()
  return (
    <Editor
      title={visit ? 'Reporter la visite' : 'Planifier la prochaine visite'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!day}
      submit={() =>
        void mutation.run(async () => {
          if (visit) {
            await call((c) => c.visits.plan({ params: { id: visit.id }, payload: { scheduled_on: day } }))
            close()
          } else if (model) {
            const result = await call((c) => c.visits.create({ payload: { template_id: model.id, scheduled_on: day } }))
            go(result.id)
          }
        })
      }
    >
      <Text>
        {visit?.name ?? model?.name} · {visit?.building ?? model?.building}
      </Text>
      <DateField label="Jour prévu" value={day} onChange={setDay} />
      {model && <Text type="supporting">Les mêmes points seront repris, sans les constats de la dernière visite.</Text>}
    </Editor>
  )
}
function PointEditor({
  point,
  visitId,
  close,
  saved,
}: {
  point: VisitPoint
  visitId: string
  close: () => void
  saved: () => void
}) {
  const [state, setState] = useState(point.state),
    [note, setNote] = useState(point.note),
    mutation = useMutation()
  return (
    <Editor
      title={point.zone + ' · ' + point.label}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={(state === 'issue' || state === 'not_verified') && !note.trim()}
      submit={() =>
        void mutation.run(
          () => call((c) => c.visits.point({ params: { id: visitId, pointId: point.id }, payload: { state, note } })),
          saved,
        )
      }
    >
      <Selector
        label="Constat"
        value={state}
        onChange={(v) => setState(v as VisitPointState)}
        options={Object.entries(pointStateLabels).map(([value, label]) => ({ value, label }))}
      />
      <TextArea
        label={state === 'not_verified' ? 'Pourquoi ce point n’a pas été vérifié' : 'Observation'}
        value={note}
        onChange={setNote}
        isRequired={state === 'issue' || state === 'not_verified'}
      />
    </Editor>
  )
}

export function TechnicalVisit({ id }: { id: string }) {
  const load = useCallback(() => call((c) => c.visits.detail({ params: { id } })), [id])
  const result = useQuery('visit:' + id, load),
    mutation = useMutation()
  const [point, setPoint] = useState<VisitPoint | null>(null),
    [action, setAction] = useState<'finish' | 'cancel' | null>(null),
    [plan, setPlan] = useState(false),
    [day, setDay] = useState(today()),
    [report, setReport] = useState(''),
    [copyMessage, setCopyMessage] = useState('')
  useDetailCrumb(result.data?.name ?? '')
  if (!result.data) return <Loading error={result.error} retry={() => void result.refresh()} />
  const visit = result.data,
    editable = visit.status === 'planned'
  const ready = visit.points.every((p) => p.state !== 'pending')
  const zones = [...new Set(visit.points.map((p) => p.zone))]
  const refresh = () => {
    setPoint(null)
    setAction(null)
    setPlan(false)
    void result.refresh()
  }
  const copy = () =>
    void mutation.run(async () => {
      await navigator.clipboard.writeText(
        toTSV([
          ['Visite', 'Bâtiment', 'Date', 'Statut', 'Zone', 'Point', 'Constat', 'Observation', 'Auteur', 'Signalement'],
          ...visit.points.map((p) => [
            visit.name,
            visit.building,
            visit.completed_on ?? visit.scheduled_on,
            visit.status === 'done' ? 'Réalisée' : 'Annulée',
            p.zone,
            p.label,
            pointStateLabels[p.state],
            p.note,
            p.actor,
            p.issue_id ?? '',
          ]),
          [
            visit.name,
            visit.building,
            visit.completed_on ?? visit.scheduled_on,
            'Compte rendu',
            '',
            '',
            '',
            visit.report,
            visit.actor,
            '',
          ],
        ]),
      )
      setCopyMessage('Compte rendu copié pour Excel.')
    })
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>{visit.name}</Heading>
            <Text>
              {visit.building} · {dateLabel(visit.completed_on ?? visit.scheduled_on)} ·{' '}
              {frequencyLabels[visit.frequency]}
            </Text>
            <StateToken state={visit.status} />
          </VStack>
          <HStack gap={2} wrap="wrap">
            {editable ? (
              <>
                <Button label="Reporter" onClick={() => setPlan(true)} />
                <Button label="Annuler la visite" onClick={() => setAction('cancel')} />
                <Button
                  label="Terminer la visite"
                  variant="primary"
                  isDisabled={!ready || mutation.busy}
                  onClick={() => setAction('finish')}
                />
              </>
            ) : (
              <Button label="Copier le compte rendu" onClick={copy} isLoading={mutation.busy} />
            )}
          </HStack>
        </HStack>
      }
    >
      <VStack gap={4}>
        <Feedback error={mutation.error} success={copyMessage || mutation.success} />
        <Text>
          {visit.handled}/{visit.total} points traités · {visit.anomalies} anomalie(s)
        </Text>
        {editable && !ready && (
          <Text type="supporting">Traitez chaque point avant de terminer. « Non vérifié » exige une explication.</Text>
        )}
        {!editable && (
          <Text>
            {visit.actor ? 'Réalisée par ' + visit.actor + '. ' : ''}
            {visit.report || 'Aucun commentaire général.'}
          </Text>
        )}
        {zones.map((zone) => (
          <List key={zone} hasDividers header={<Heading level={2}>{zone}</Heading>}>
            {visit.points
              .filter((p) => p.zone === zone)
              .map((p) => (
                <ListItem
                  key={p.id}
                  label={p.label}
                  description={[p.note, p.actor && 'Constat par ' + p.actor].filter(Boolean).join(' · ')}
                  endContent={
                    <HStack gap={2} wrap="wrap">
                      <Token
                        label={pointStateLabels[p.state]}
                        size="sm"
                        color={p.state === 'issue' ? 'orange' : p.state === 'ok' ? 'green' : 'gray'}
                      />
                      {editable ? (
                        <Button label="Saisir le constat" size="sm" onClick={() => setPoint(p)} />
                      ) : p.issue_id ? (
                        <Link href={'#technical/signalements?q=' + encodeURIComponent(p.label)}>
                          Voir le signalement
                        </Link>
                      ) : p.state === 'issue' && visit.status === 'done' ? (
                        <Button
                          label="Créer un signalement"
                          size="sm"
                          isDisabled={mutation.busy}
                          onClick={() =>
                            void mutation.run(
                              () => call((c) => c.visits.issue({ params: { id, pointId: p.id } })),
                              refresh,
                            )
                          }
                        />
                      ) : null}
                    </HStack>
                  }
                />
              ))}
          </List>
        ))}
      </VStack>
      {point && <PointEditor point={point} visitId={id} close={() => setPoint(null)} saved={refresh} />}
      {plan && <PlanEditor visit={visit} close={refresh} />}
      {action && (
        <Editor
          title={action === 'finish' ? 'Terminer la visite' : 'Annuler la visite'}
          label={action === 'finish' ? 'Confirmer la réalisation' : 'Confirmer l’annulation'}
          close={() => setAction(null)}
          busy={mutation.busy}
          error={mutation.error}
          submit={() =>
            void mutation.run(
              () =>
                call((c) =>
                  c.visits.act({
                    params: { id },
                    payload: { action, completed_on: action === 'finish' ? day : null, report },
                  }),
                ),
              refresh,
            )
          }
        >
          {action === 'finish' && <DateField label="Date réelle de visite" value={day} onChange={setDay} past />}
          <Text>
            {action === 'finish'
              ? 'Les constats seront conservés en lecture seule. Les anomalies pourront créer des signalements.'
              : 'Cette visite sera conservée dans l’historique et ne repoussera pas la prochaine échéance.'}
          </Text>
          <TextArea label="Compte rendu" value={report} onChange={setReport} />
        </Editor>
      )}
    </PageLayout>
  )
}

export function VisitTemplates() {
  const [building, setBuilding] = useHashParam('batiment', ''),
    [archive, setArchive] = useHashParam('archive', 'no'),
    [page, setPage] = useState(1),
    [plan, setPlan] = useState<VisitTemplateSummary | null>(null)
  const load = useCallback(
    () => call((c) => c.visits.templates({ query: { building, archived: archive === 'yes' ? 'yes' : 'no', page } })),
    [building, archive, page],
  )
  const result = useQuery(`visit-models:${building}:${archive}:${page}`, load)
  const pagination = useTablePagination<VisitTemplateSummary>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des modèles',
  })
  return (
    <VisitsPage
      title="Modèles de visite"
      description="Préparer des checklists réutilisables, sans obligation pour planifier une visite."
      actions={
        <HStack gap={2} wrap="wrap">
          <Button label="Voir les visites" href="#visits" />
          <Button label="Nouveau modèle" variant="primary" href="#visits/templates/new" />
        </HStack>
      }
    >
      <VStack gap={4}>
        <HStack gap={3} wrap="wrap">
          <BuildingFilter
            value={building}
            onChange={(v) => {
              setBuilding(v)
              setPage(1)
            }}
          />
          <Selector
            label="Afficher"
            value={archive}
            onChange={(v) => {
              setArchive(v ?? 'no')
              setPage(1)
            }}
            options={[
              { value: 'no', label: 'Modèles actifs' },
              { value: 'yes', label: 'Modèles archivés' },
            ]}
          />
        </HStack>
        {!result.data ? (
          <Loading error={result.error} retry={() => void result.refresh()} />
        ) : result.data.total === 0 ? (
          <Text>Aucun modèle. Vous pouvez en créer un ou planifier directement une visite.</Text>
        ) : (
          <Table
            data={[...result.data.items]}
            idKey="id"
            rowCount={result.data.total}
            rowIndexStart={(page - 1) * 20 + 1}
            dividers="rows"
            plugins={{ pagination }}
            columns={[
              {
                key: 'name',
                header: 'Modèle',
                width: proportional(3),
                renderCell: (v) => <Link href={'#visits/templates/' + v.id}>{v.name}</Link>,
              },
              { key: 'building', header: 'Bâtiment', width: proportional(2) },
              {
                key: 'frequency',
                header: 'Fréquence',
                width: proportional(2),
                renderCell: (v) => <Text>{frequencyLabels[v.frequency]}</Text>,
              },
              { key: 'point_count', header: 'Points', width: proportional(1) },
              {
                key: 'id',
                header: 'Actions',
                width: proportional(2),
                align: 'end',
                renderCell: (v) =>
                  v.planned_id ? (
                    <Button size="sm" label="Ouvrir la visite" href={visitHref(v.planned_id)} />
                  ) : (
                    <Button size="sm" label="Planifier une visite" isDisabled={v.archived} onClick={() => setPlan(v)} />
                  ),
              },
            ]}
          />
        )}
      </VStack>
      {plan && <PlanEditor model={plan} close={() => setPlan(null)} />}
    </VisitsPage>
  )
}
