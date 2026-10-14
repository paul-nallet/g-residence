import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Token } from '@astryxdesign/core/Token'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Meter, MeterKind, MonthlyConsumption, Reading } from '../../src/domain/meters.ts'
import { today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useHashPage, useHashParam } from '../lib/hashParams.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import {
  barRadius,
  chartColors,
  chartMargin,
  chartTooltip,
  gridProps,
  shortMonth,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from './charts.tsx'
import { DateField, dateLabel, Editor, Feedback, Loading, PeriodNav } from './shared.tsx'

const kindLabels = { water: 'Eau', electricity: 'Électricité', gas: 'Gaz' }
const unitLabel = (unit: string) => (unit === 'm3' ? 'm³' : 'kWh')
const indexLabel = (value: number, unit: string) =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 20 })} ${unitLabel(unit)}`

function MeterEditor({ meter, close, saved }: { meter?: Meter; close: () => void; saved: () => void }) {
  const [name, setName] = useState(meter?.name ?? ''),
    [location, setLocation] = useState(meter?.location ?? ''),
    [reference, setReference] = useState(meter?.reference ?? ''),
    [kind, setKind] = useState<MeterKind>(meter?.kind ?? 'electricity'),
    [unit, setUnit] = useState<'m3' | 'kWh'>(meter?.unit ?? 'kWh'),
    locked = !!meter?.latest_date
  const mutation = useMutation()
  return (
    <Editor
      title={meter ? 'Modifier le compteur' : 'Ajouter un compteur des communs'}
      close={close}
      submit={() =>
        void mutation.run(() => {
          const payload = { name, location, reference, kind, unit }
          return call((client) =>
            meter ? client.meters.update({ params: { id: meter.id }, payload }) : client.meters.create({ payload }),
          )
        }, saved)
      }
      busy={mutation.busy}
      error={mutation.error}
    >
      <TextInput
        label="Nom du compteur"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Électricité des communs — Bâtiment A"
      />
      <TextInput
        label="Emplacement"
        value={location}
        onChange={setLocation}
        isRequired
        placeholder="Local technique, sous-sol…"
      />
      <TextInput label="Référence ou numéro du compteur" value={reference} onChange={setReference} isOptional />
      {locked ? (
        <Text color="secondary">
          {kindLabels[kind]} · {unitLabel(unit)}. L’énergie et l’unité ne peuvent plus changer après un premier relevé.
        </Text>
      ) : (
        <>
          <Selector
            label="Énergie ou fluide"
            value={kind}
            onChange={(value) => {
              setKind(value as MeterKind)
              setUnit(value === 'electricity' ? 'kWh' : 'm3')
            }}
            options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))}
          />
          {kind === 'gas' ? (
            <Selector
              label="Unité affichée sur le compteur"
              value={unit}
              onChange={(value) => setUnit(value as 'm3' | 'kWh')}
              options={[
                { value: 'm3', label: 'm³' },
                { value: 'kWh', label: 'kWh' },
              ]}
            />
          ) : (
            <Text>Unité : {unitLabel(unit)}</Text>
          )}
        </>
      )}
    </Editor>
  )
}

const defaultDay = (month?: string) => {
  const day = today()
  if (!month || month >= day.slice(0, 7)) return day
  const [year = 0, index = 0] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10)
}

function ReadingEditor({
  meter,
  reading,
  month,
  close,
  saved,
}: {
  meter: Meter
  reading?: Reading
  month?: string
  close: () => void
  saved: () => void
}) {
  const [date, setDate] = useState(reading?.observed_on ?? defaultDay(month)),
    [value, setValue] = useState(reading ? String(reading.value).replace('.', ',') : '')
  const mutation = useMutation()
  const parsed = Number(value.replace(',', '.'))
  const valid =
    value.trim() !== '' &&
    /^(?:[0-9]+(?:[.,][0-9]+)?)$/.test(value.trim()) &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= 1e12
  return (
    <Editor
      title={reading ? 'Corriger le relevé' : 'Saisir un relevé'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!valid || !date}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              reading
                ? client.meters.correct({
                    params: { id: meter.id, readingId: reading.id },
                    payload: { observed_on: date, value: parsed },
                  })
                : client.meters.record({ params: { id: meter.id }, payload: { observed_on: date, value: parsed } }),
            ),
          saved,
        )
      }
    >
      <Text>
        {meter.name} · {meter.location}
      </Text>
      <DateField label="Date de constat" value={date} onChange={setDate} past />
      <TextInput
        label={'Index du compteur (' + unitLabel(meter.unit) + ')'}
        value={value}
        onChange={setValue}
        isRequired
        hasAutoFocus
        placeholder="Ex. 12345,67"
      />
      <Text color="secondary">
        Recopiez l’index total affiché sur le compteur. Il ne s’agit pas de la consommation du mois.
      </Text>
      {value && !valid && (
        <Feedback error="Saisissez un index positif ou nul, avec une virgule ou un point pour les décimales." />
      )}
      {!reading && meter.latest_value !== null && (
        <Text>
          Dernier index : {indexLabel(meter.latest_value, meter.unit)} le {dateLabel(meter.latest_date ?? '')}.
        </Text>
      )}
    </Editor>
  )
}

const monthLabel = (month: string, format: 'short' | 'long') =>
  new Intl.DateTimeFormat('fr-FR', { month: format, timeZone: 'UTC' }).format(new Date(month + '-01'))
const amountLabel = (value: number, unit: string) =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unitLabel(unit)}`

const missingLabel = (month: MonthlyConsumption) =>
  month.reset ? 'Index en baisse' : month.to ? 'Pas d’index antérieur' : 'Aucun relevé'

function ConsumptionChart({ months, unit }: { months: ReadonlyArray<MonthlyConsumption>; unit: string }) {
  const data = months.map((month) => ({ ...month, label: shortMonth(month.month) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        margin={chartMargin}
        accessibilityLayer
        title={'Consommation mensuelle en ' + unitLabel(unit)}
      >
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...xAxisProps} />
        <YAxis
          {...yAxisProps}
          tickFormatter={(value: number) => value.toLocaleString('fr-FR', { notation: 'compact' })}
        />
        <Tooltip
          {...tooltipProps}
          content={chartTooltip<MonthlyConsumption>(
            (month) => monthLabel(month.month, 'long'),
            (value, entry) =>
              typeof value === 'number' ? amountLabel(value, unit) : missingLabel(entry.payload as MonthlyConsumption),
          )}
        />
        <Bar
          dataKey="value"
          name={'Consommation (' + unitLabel(unit) + ')'}
          fill={chartColors.blue}
          radius={barRadius}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ConsumptionRecap({ meter, version }: { meter: Meter; version: number }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const load = useCallback(
    () => call((client) => client.meters.consumption({ params: { id: meter.id }, query: { year } })),
    [meter.id, year],
  )
  const result = useQuery(`consumption:${meter.id}:${year}:${version}`, load)
  return (
    <VStack gap={3}>
      <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
        <Heading level={2}>Récapitulatif {year}</Heading>
        <PeriodNav
          label="Navigation par année"
          previous="Précédente"
          current="Année courante"
          next="Suivante"
          onPrevious={() => setYear(year - 1)}
          onCurrent={() => setYear(Number(today().slice(0, 4)))}
          onNext={() => setYear(year + 1)}
        />
      </HStack>
      <Text color="secondary">
        Consommation du mois = dernier index du mois moins dernier index constaté avant le mois. Sans relevé dans le
        mois, ou si l’index baisse (compteur remplacé), aucune valeur n’est calculée.
      </Text>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <Card>
            <VStack gap={2}>
              <Text type="label">Total calculé : {amountLabel(result.data.total, meter.unit)}</Text>
              <ConsumptionChart months={result.data.months} unit={meter.unit} />
            </VStack>
          </Card>
          <Table
            data={[...result.data.months]}
            idKey="month"
            dividers="rows"
            columns={[
              {
                key: 'month',
                header: 'Mois',
                width: proportional(1),
                renderCell: (row) => <Text>{monthLabel(row.month, 'long')}</Text>,
              },
              {
                key: 'value',
                header: 'Consommation (' + unitLabel(meter.unit) + ')',
                width: proportional(1),
                renderCell: (row) =>
                  row.value !== null ? (
                    <Text>{amountLabel(row.value, meter.unit)}</Text>
                  ) : (
                    <Token
                      label={row.reset ? 'Index en baisse' : row.to ? 'Pas d’index antérieur' : 'Aucun relevé'}
                      color={row.reset ? 'orange' : 'gray'}
                      size="sm"
                    />
                  ),
              },
              {
                key: 'to',
                header: 'Période',
                width: proportional(2),
                renderCell: (row) => (
                  <Text>{row.from && row.to ? dateLabel(row.from) + ' → ' + dateLabel(row.to) : '—'}</Text>
                ),
              },
            ]}
          />
        </>
      )}
    </VStack>
  )
}

export function MeterDetail({ id }: { id: string }) {
  const load = useCallback(() => call((client) => client.meters.detail({ params: { id } })), [id]),
    result = useQuery('meter:' + id, load)
  useDetailCrumb(result.data?.name ?? '')
  if (!result.data)
    return (
      <PageLayout header={<Heading level={1}>Fiche du compteur</Heading>}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </PageLayout>
    )
  return <MeterHistory meter={result.data} changed={() => void result.refresh()} />
}

function MeterHistory({ meter, changed }: { meter: Meter; changed: () => void }) {
  const [page, setPage] = useState(1),
    [editor, setEditor] = useState<Reading | 'new' | null>(null),
    [editing, setEditing] = useState(false),
    [success, setSuccess] = useState(''),
    [version, setVersion] = useState(0)
  const load = useCallback(
    () => call((client) => client.meters.readings({ params: { id: meter.id }, query: { page } })),
    [meter.id, page],
  )
  const result = useQuery(`readings:${meter.id}:${page}`, load)
  const pagination = useTablePagination<Reading>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des relevés',
  })
  return (
    <PageLayout
      header={
        <VStack gap={3}>
          <HStack gap={3} wrap="wrap" hAlign="between">
            <VStack gap={1}>
              <Heading level={1}>{meter.name}</Heading>
              <Text>
                {kindLabels[meter.kind]} · {meter.location}
                {meter.reference ? ' · Réf. ' + meter.reference : ''}
              </Text>
            </VStack>
            <HStack gap={2} wrap="wrap">
              <Button label="Modifier le compteur" onClick={() => setEditing(true)} />
              <Button label="Saisir un relevé" variant="primary" onClick={() => setEditor('new')} />
            </HStack>
          </HStack>
        </VStack>
      }
    >
      <Feedback success={success} />
      <ConsumptionRecap meter={meter} version={version} />
      <Heading level={2}>Historique des index</Heading>
      <Text color="secondary">Valeurs constatées, de la plus récente à la plus ancienne.</Text>
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
              key: 'observed_on',
              header: 'Date de constat',
              width: proportional(1),
              renderCell: (row) => <Text>{dateLabel(row.observed_on)}</Text>,
            },
            {
              key: 'value',
              header: 'Index (' + unitLabel(meter.unit) + ')',
              width: proportional(1),
              renderCell: (row) => <Text>{indexLabel(row.value, meter.unit)}</Text>,
            },
            { key: 'actor', header: 'Saisi ou corrigé par', width: proportional(1) },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(1),
              renderCell: (row) => (
                <Button
                  label="Corriger"
                  aria-label={'Corriger le relevé du ' + dateLabel(row.observed_on)}
                  onClick={() => setEditor(row)}
                />
              ),
            },
          ]}
        />
      ) : (
        <Text>Aucun relevé pour ce compteur. Saisissez le premier index constaté.</Text>
      )}
      {editing && (
        <MeterEditor
          meter={meter}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false)
            setSuccess('Compteur modifié.')
            changed()
          }}
        />
      )}
      {editor && (
        <ReadingEditor
          meter={meter}
          reading={editor === 'new' ? undefined : editor}
          close={() => setEditor(null)}
          saved={() => {
            setSuccess(editor === 'new' ? 'Relevé enregistré.' : 'Relevé corrigé.')
            setEditor(null)
            setVersion(version + 1)
            void result.refresh()
            changed()
          }}
        />
      )}
    </PageLayout>
  )
}

export function Meters() {
  const [month, setMonth] = useHashParam('mois', today().slice(0, 7)),
    [page, setPage] = useHashPage(),
    [adding, setAdding] = useState(false),
    [recording, setRecording] = useState<Meter | null>(null),
    [success, setSuccess] = useState('')
  const load = useCallback(() => call((client) => client.meters.list({ query: { month, page } })), [month, page])
  const result = useQuery(`meters:${month}:${page}`, load)
  const pagination = useTablePagination<Meter>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des compteurs',
  })
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Relevés des communs</Heading>
            <Text color="secondary">Compteurs d’eau, d’électricité et de gaz de la résidence.</Text>
          </VStack>
          <Button label="Ajouter un compteur" variant="primary" onClick={() => setAdding(true)} />
        </HStack>
      }
    >
      <PeriodNav
        label="Navigation par mois"
        previous="Précédent"
        current="Mois courant"
        next="Suivant"
        onPrevious={() => {
          const date = new Date(month + '-01')
          date.setUTCMonth(date.getUTCMonth() - 1)
          setMonth(date.toISOString().slice(0, 7))
          setPage(1)
        }}
        onCurrent={() => {
          setMonth(today().slice(0, 7))
          setPage(1)
        }}
        onNext={() => {
          const date = new Date(month + '-01')
          date.setUTCMonth(date.getUTCMonth() + 1)
          setMonth(date.toISOString().slice(0, 7))
          setPage(1)
        }}
      />
      <Text>
        Suivi de{' '}
        {new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(month + '-01'),
        )}
        . Saisissez un index daté pour chaque compteur.
      </Text>
      <Feedback success={success} />
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
              key: 'name',
              header: 'Compteur',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Link href={'#meters/' + row.id}>{row.name}</Link>
                  <Text type="supporting">
                    {row.location}
                    {row.reference ? ' · ' + row.reference : ''}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'kind',
              header: 'Fluide / unité',
              width: proportional(1),
              renderCell: (row) => (
                <Text>
                  {kindLabels[row.kind]} · {unitLabel(row.unit)}
                </Text>
              ),
            },
            {
              key: 'latest_value',
              header: 'Dernier index constaté',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text>{row.latest_value === null ? 'Aucun relevé' : indexLabel(row.latest_value, row.unit)}</Text>
                  {row.latest_date && <Text type="supporting">{dateLabel(row.latest_date)}</Text>}
                </VStack>
              ),
            },
            {
              key: 'month_date',
              header: 'Mois suivi',
              width: proportional(1),
              renderCell: (row) => (
                <Token
                  label={row.month_date ? 'Relevé enregistré' : 'À relever'}
                  color={row.month_date ? 'green' : 'gray'}
                />
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(2),
              renderCell: (row) => (
                <HStack gap={2} wrap="wrap">
                  <Button label="Relever" aria-label={'Relever ' + row.name} onClick={() => setRecording(row)} />
                  <Button label="Historique" aria-label={'Historique de ' + row.name} href={'#meters/' + row.id} />
                </HStack>
              ),
            },
          ]}
        />
      ) : (
        <Text>
          Aucun compteur identifié. Ajoutez le premier compteur des parties communes pour commencer les relevés.
        </Text>
      )}
      {adding && (
        <MeterEditor
          close={() => setAdding(false)}
          saved={() => {
            setAdding(false)
            setSuccess('Compteur ajouté.')
            void result.refresh()
          }}
        />
      )}
      {recording && (
        <ReadingEditor
          meter={recording}
          month={month}
          close={() => setRecording(null)}
          saved={() => {
            setRecording(null)
            setSuccess('Relevé enregistré.')
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}
