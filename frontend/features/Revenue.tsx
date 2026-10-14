import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  DEFAULT_VAT_RATE,
  type RevenueEntry,
  type RevenueSource,
  type RevenueYearRow,
  vatBreakdown,
  vatLabel,
  type VatMode,
  vatRates,
  type VatRate,
} from '../../src/domain/revenue.ts'
import { today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useHashPage, useHashParam } from '../lib/hashParams.ts'
import { copyText } from '../lib/clipboard.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import {
  barRadius,
  chartColors,
  ChartLegend,
  chartMargin,
  chartTooltip,
  coloredTick,
  gridProps,
  legendProps,
  lineProps,
  shortMonth,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from './charts.tsx'
import { Editor, Feedback, Loading, PeriodNav } from './shared.tsx'

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const euros = (cents: number) => money.format(cents / 100)
const amountLabel = (cents: number, mode: VatMode | null) => euros(cents) + (mode === 'ht' ? ' HT' : ' TTC')
const modeOptions = [
  { value: 'ttc', label: 'TTC, avec taux de TVA' },
  { value: 'ht', label: 'HT, sans taux' },
]
const rateOptions = vatRates.map((rate) => ({ value: String(rate), label: vatLabel('ttc', rate).slice(4) }))
const compact = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const periodLabel = (period: string, month: 'long' | 'short' = 'long') =>
  new Intl.DateTimeFormat('fr-FR', { month, year: 'numeric', timeZone: 'UTC' }).format(new Date(period + '-01'))
const shiftPeriod = (period: string, amount: number) => {
  const date = new Date(period + '-01')
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}
const parseCents = (value: string) => {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.replace(/[\s  €]/g, ''))
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 100000000000 ? cents : null
}
const centsInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, '0')
  return {
    value,
    label: new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`2026-${value}-01`)),
  }
})

function SourceEditor({ source, close, saved }: { source?: RevenueSource; close: () => void; saved: () => void }) {
  const [name, setName] = useState(source?.name ?? ''),
    [description, setDescription] = useState(source?.description ?? ''),
    [mode, setMode] = useState<VatMode>(source?.vat_mode ?? 'ttc'),
    [rate, setRate] = useState(String(source?.vat_rate ?? DEFAULT_VAT_RATE))
  const mutation = useMutation()
  const payload = {
    name,
    description,
    vat_mode: mode,
    vat_rate: mode === 'ttc' ? (Number(rate) as VatRate) : null,
  }
  return (
    <Editor
      title={source ? 'Modifier la source' : 'Ajouter une source de prestation'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              source
                ? client.revenue.update({ params: { id: source.id }, payload })
                : client.revenue.create({ payload }),
            ),
          saved,
        )
      }
    >
      <TextInput
        label="Nom de la source"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Café, snacks, laverie, impressions…"
      />
      <TextInput label="Description" value={description} onChange={setDescription} isOptional />
      <Selector
        label="Saisie des montants"
        value={mode}
        onChange={(value) => setMode(value === 'ht' ? 'ht' : 'ttc')}
        options={modeOptions}
      />
      {mode === 'ttc' && <Selector label="Taux de TVA" value={rate} onChange={setRate} options={rateOptions} />}
      {source && (
        <Text color="secondary">
          Les mois déjà saisis gardent leur nature et leur taux ; une correction reprend ceux-ci.
        </Text>
      )}
    </Editor>
  )
}

function EntryEditor({
  source,
  entry,
  period,
  close,
  saved,
}: {
  source: RevenueSource
  entry?: RevenueEntry
  period: string
  close: () => void
  saved: () => void
}) {
  const current = today().slice(0, 7)
  const initial = entry?.period ?? (period > current ? current : period)
  const [year, setYear] = useState(initial.slice(0, 4)),
    [month, setMonth] = useState(initial.slice(5, 7)),
    [amount, setAmount] = useState(entry ? centsInput(entry.amount_cents) : ''),
    [comment, setComment] = useState(entry?.comment ?? '')
  const mutation = useMutation()
  const cents = parseCents(amount),
    selected = `${year}-${month}`,
    future = selected > current
  const years = Array.from({ length: 6 }, (_, index) => String(Number(current.slice(0, 4)) - index))
  if (!years.includes(year)) years.push(year)
  return (
    <Editor
      title={entry ? 'Corriger la saisie' : 'Saisir le chiffre d’affaires'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={cents === null || future}
      submit={() => {
        if (cents === null) return
        const payload = { period: selected, amount_cents: cents, comment }
        void mutation.run(
          () =>
            call((client) =>
              entry
                ? client.revenue.correct({ params: { id: source.id, entryId: entry.id }, payload })
                : client.revenue.record({ params: { id: source.id }, payload }),
            ),
          saved,
        )
      }}
    >
      <Text>{source.name}</Text>
      <HStack gap={3} wrap="wrap">
        <Selector label="Mois" value={month} onChange={setMonth} options={monthOptions} />
        <Selector
          label="Année"
          value={year}
          onChange={setYear}
          options={years.map((value) => ({ value, label: value }))}
        />
      </HStack>
      {future && <Feedback error="Le mois saisi ne peut pas être dans le futur." />}
      <TextInput
        label={`Chiffre d’affaires du mois (€ ${source.vat_mode === 'ht' ? 'HT' : 'TTC'})`}
        description={'Saisie ' + vatLabel(source.vat_mode, source.vat_rate) + '.'}
        value={amount}
        onChange={setAmount}
        isRequired
        hasAutoFocus
        placeholder="Ex. 1 234,50"
      />
      {amount && cents === null && (
        <Feedback error="Saisissez un montant positif ou nul, avec au plus deux décimales." />
      )}
      {cents !== null && source.vat_mode === 'ttc' && (
        <Text color="secondary">
          Soit {euros(vatBreakdown(cents, 'ttc', source.vat_rate).net_cents)} HT et{' '}
          {euros(vatBreakdown(cents, 'ttc', source.vat_rate).vat_cents ?? 0)} de TVA.
        </Text>
      )}
      <TextInput label="Commentaire" value={comment} onChange={setComment} isOptional />
      {!entry && source.latest_period && source.latest_amount !== null && (
        <Text color="secondary">
          Dernière saisie : {amountLabel(source.latest_amount, source.latest_vat_mode)} en{' '}
          {periodLabel(source.latest_period)}.
        </Text>
      )}
    </Editor>
  )
}

const tooltipValue = (value: unknown) => (typeof value === 'number' ? money.format(value) : 'Aucune saisie')

function RevenueChart({
  year,
  months,
  unit,
}: {
  year: number
  months: ReadonlyArray<number | null>
  unit: 'HT' | 'TTC'
}) {
  const current = today()
  const last = Math.max(
    months.findLastIndex((value) => value !== null),
    year === Number(current.slice(0, 4))
      ? Number(current.slice(5, 7)) - 1
      : year < Number(current.slice(0, 4))
        ? 11
        : -1,
  )
  const sums = months.reduce<number[]>((all, value) => [...all, (all.at(-1) ?? 0) + (value ?? 0)], [])
  const data = months.map((value, index) => {
    const period = `${year}-${String(index + 1).padStart(2, '0')}`
    return {
      period,
      month: shortMonth(period),
      amount: value === null ? null : value / 100,
      cumulative: index <= last ? sums[index]! / 100 : null,
    }
  })
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart
        data={data}
        margin={chartMargin}
        accessibilityLayer
        title={`Chiffre d’affaires ${unit} ${year} par mois et cumul annuel`}
      >
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...xAxisProps} />
        <YAxis yAxisId="month" {...yAxisProps} tickFormatter={(value) => compact.format(value)} />
        <YAxis
          yAxisId="cumulative"
          orientation="right"
          {...yAxisProps}
          tick={coloredTick(chartColors.orange)}
          tickFormatter={(value) => compact.format(value)}
        />
        <Tooltip
          {...tooltipProps}
          content={chartTooltip<(typeof data)[number]>((row) => periodLabel(row.period), tooltipValue)}
        />
        <Legend {...legendProps} content={<ChartLegend />} />
        <Bar
          yAxisId="month"
          dataKey="amount"
          name={'CA du mois ' + unit}
          fill={chartColors.blue}
          radius={barRadius}
          maxBarSize={40}
        />
        <Line
          yAxisId="cumulative"
          dataKey="cumulative"
          name={'Cumul annuel ' + unit}
          stroke={chartColors.orange}
          {...lineProps}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SourceRecap({ source, version }: { source: RevenueSource; version: number }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const load = useCallback(() => call((client) => client.revenue.year({ params: { year } })), [year])
  const result = useQuery(`revenue-year:${year}:${version}`, load)
  const row = result.data?.rows.find((item) => item.id === source.id)
  return (
    <VStack gap={3}>
      <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
        <Heading level={2}>Année {year}</Heading>
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
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <Card>
          <VStack gap={2}>
            <Text type="label">
              Total {year} : {euros(row?.total_net ?? 0)} HT
              {row?.total_vat === null || row?.total_vat === undefined
                ? ''
                : `, dont TVA ${euros(row.total_vat)} sur les mois TTC`}
            </Text>
            <RevenueChart year={year} months={row?.net ?? Array.from({ length: 12 }, () => null)} unit="HT" />
          </VStack>
        </Card>
      )}
    </VStack>
  )
}

export function RevenueSourceDetail({ id }: { id: string }) {
  const load = useCallback(() => call((client) => client.revenue.detail({ params: { id } })), [id]),
    result = useQuery('revenue-source:' + id, load)
  useDetailCrumb(result.data?.name ?? '')
  if (!result.data)
    return (
      <PageLayout header={<Heading level={1}>Source de prestation</Heading>}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </PageLayout>
    )
  return <SourceHistory source={result.data} changed={() => void result.refresh()} />
}

function SourceHistory({ source, changed }: { source: RevenueSource; changed: () => void }) {
  const [page, setPage] = useState(1),
    [editor, setEditor] = useState<RevenueEntry | 'new' | null>(null),
    [editing, setEditing] = useState(false),
    [success, setSuccess] = useState(''),
    [version, setVersion] = useState(0)
  const load = useCallback(
    () => call((client) => client.revenue.entries({ params: { id: source.id }, query: { page } })),
    [source.id, page],
  )
  const result = useQuery(`revenue-entries:${source.id}:${page}`, load)
  const pagination = useTablePagination<RevenueEntry>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des saisies',
  })
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Heading level={1}>{source.name}</Heading>
              <Token label={'Saisie ' + vatLabel(source.vat_mode, source.vat_rate)} color="gray" />
            </HStack>
            {source.description && <Text>{source.description}</Text>}
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Modifier la source" onClick={() => setEditing(true)} />
            <Button label="Saisir un mois" variant="primary" onClick={() => setEditor('new')} />
          </HStack>
        </HStack>
      }
    >
      <Feedback success={success} />
      <SourceRecap source={source} version={version} />
      <Heading level={2}>Historique mensuel</Heading>
      <Text color="secondary">Chiffre d’affaires par mois, du plus récent au plus ancien.</Text>
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
              key: 'period',
              header: 'Mois',
              width: proportional(1),
              renderCell: (row) => <Text>{periodLabel(row.period)}</Text>,
            },
            {
              key: 'amount_cents',
              header: 'Montant saisi',
              width: proportional(1),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text>{amountLabel(row.amount_cents, row.vat_mode)}</Text>
                  {row.vat_mode === 'ttc' && <Text type="supporting">{vatLabel(row.vat_mode, row.vat_rate)}</Text>}
                </VStack>
              ),
            },
            {
              key: 'net_cents',
              header: 'HT',
              width: proportional(1),
              renderCell: (row) => <Text>{euros(row.net_cents)}</Text>,
            },
            {
              key: 'vat_cents',
              header: 'TVA',
              width: proportional(1),
              renderCell: (row) => <Text>{row.vat_cents === null ? '—' : euros(row.vat_cents)}</Text>,
            },
            { key: 'comment', header: 'Commentaire', width: proportional(2) },
            { key: 'actor', header: 'Saisi ou corrigé par', width: proportional(1) },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(1),
              renderCell: (row) => (
                <Button
                  label="Corriger"
                  aria-label={'Corriger la saisie de ' + periodLabel(row.period)}
                  onClick={() => setEditor(row)}
                />
              ),
            },
          ]}
        />
      ) : (
        <Text>Aucune saisie pour cette source. Saisissez le chiffre d’affaires d’un premier mois.</Text>
      )}
      {editor && (
        <EntryEditor
          source={source}
          entry={editor === 'new' ? undefined : editor}
          period={today().slice(0, 7)}
          close={() => setEditor(null)}
          saved={() => {
            setSuccess(editor === 'new' ? 'Chiffre d’affaires enregistré.' : 'Saisie corrigée.')
            setEditor(null)
            setVersion(version + 1)
            void result.refresh()
            changed()
          }}
        />
      )}
      {editing && (
        <SourceEditor
          source={source}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false)
            setSuccess('Source modifiée.')
            changed()
          }}
        />
      )}
    </PageLayout>
  )
}

type YearLine = {
  id: string
  name: string
  nature: string
  footer: boolean
  months: ReadonlyArray<number | null>
  net: number | null
  vat: number | null
}
type YearData = {
  rows: ReadonlyArray<RevenueYearRow>
  net: { months: ReadonlyArray<number>; total: number }
  gross: { months: ReadonlyArray<number>; total: number }
  vat: { months: ReadonlyArray<number>; total: number }
}
const yearLines = (data: YearData): YearLine[] => [
  ...data.rows.map((row) => ({
    id: row.id,
    name: row.name,
    nature: 'Saisie ' + vatLabel(row.vat_mode, row.vat_rate),
    footer: false,
    months: row.months,
    net: row.total_net,
    vat: row.total_vat,
  })),
  {
    id: 'net',
    name: 'Total HT',
    nature: 'Toutes sources',
    footer: true,
    months: data.net.months,
    net: data.net.total,
    vat: null,
  },
  {
    id: 'gross',
    name: 'Total TTC',
    nature: 'Sources saisies TTC',
    footer: true,
    months: data.gross.months,
    net: null,
    vat: null,
  },
  {
    id: 'vat',
    name: 'TVA',
    nature: 'Sources saisies TTC',
    footer: true,
    months: data.vat.months,
    net: null,
    vat: data.vat.total,
  },
]

export function RevenueYear() {
  const [year, setYear] = useState(Number(today().slice(0, 4))),
    [copied, setCopied] = useState(''),
    [manual, setManual] = useState(false)
  const load = useCallback(() => call((client) => client.revenue.year({ params: { year } })), [year]),
    result = useQuery('revenue-year:' + year, load)
  useDetailCrumb('Récapitulatif ' + year)
  const select = (next: number) => {
    setYear(next)
    setCopied('')
    setManual(false)
  }
  const copy = async () => {
    setCopied('')
    if (await copyText(result.data!.tsv, navigator.clipboard)) {
      setCopied('Tableau copié. Vous pouvez le coller dans Excel.')
      setManual(false)
    } else {
      setManual(true)
      setCopied('La copie automatique est indisponible. Sélectionnez le tableau ci-dessous et copiez-le manuellement.')
    }
  }
  const periods = monthOptions.map((option) => `${year}-${option.value}`)
  return (
    <PageLayout
      header={
        <VStack gap={2}>
          <Heading level={1}>Récapitulatif {year}</Heading>
          <Text color="secondary">
            Montants mois par mois tels que saisis, TTC ou HT selon la source, avec les totaux HT et TVA, prêts à coller
            dans Excel.
          </Text>
        </VStack>
      }
    >
      <PeriodNav
        label="Navigation par année"
        previous="Précédente"
        current="Année courante"
        next="Suivante"
        onPrevious={() => select(year - 1)}
        onCurrent={() => select(Number(today().slice(0, 4)))}
        onNext={() => select(year + 1)}
      />
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <Card>
            <VStack gap={2}>
              <Text type="label">
                Total {year} : {euros(result.data.net.total)} HT toutes sources · {euros(result.data.gross.total)} TTC
                et {euros(result.data.vat.total)} de TVA sur les sources TTC
              </Text>
              <RevenueChart
                year={year}
                unit="HT"
                months={result.data.net.months.map((value, index) =>
                  result.data!.rows.some((row) => row.months[index] !== null) ? value : null,
                )}
              />
            </VStack>
          </Card>
          {result.data.rows.length ? (
            <Table
              data={yearLines(result.data)}
              idKey="id"
              dividers="rows"
              columns={[
                {
                  key: 'name',
                  header: 'Source',
                  width: proportional(2),
                  renderCell: (row: YearLine) =>
                    row.footer ? (
                      <VStack gap={1}>
                        <Text type="label">{row.name}</Text>
                        <Text type="supporting">{row.nature}</Text>
                      </VStack>
                    ) : (
                      <VStack gap={1}>
                        <Link href={'#services/' + row.id}>{row.name}</Link>
                        <Text type="supporting">{row.nature}</Text>
                      </VStack>
                    ),
                },
                ...periods.map((period, index) => ({
                  key: period,
                  header: periodLabel(period, 'short'),
                  width: proportional(1),
                  renderCell: (row: YearLine) => (
                    <Text>{row.months[index] === null ? '—' : euros(row.months[index]!)}</Text>
                  ),
                })),
                {
                  key: 'net',
                  header: 'Total HT',
                  width: proportional(1),
                  renderCell: (row: YearLine) => <Text type="label">{row.net === null ? '—' : euros(row.net)}</Text>,
                },
                {
                  key: 'vat',
                  header: 'TVA',
                  width: proportional(1),
                  renderCell: (row: YearLine) => <Text>{row.vat === null ? '—' : euros(row.vat)}</Text>,
                },
              ]}
            />
          ) : (
            <Text>Aucune source de prestation configurée.</Text>
          )}
          <Button label="Copier le tableau pour Excel" variant="primary" onClick={() => void copy()} />
          {copied && (
            <Text as="p" role="status">
              {copied}
            </Text>
          )}
          {manual && (
            <TextArea
              label="Tableau à copier manuellement"
              description="Sélectionnez tout le contenu, puis copiez-le et collez-le dans Excel."
              value={result.data.tsv}
              isReadOnly
              rows={8}
            />
          )}
        </>
      )}
    </PageLayout>
  )
}

export function Revenue() {
  const [month, setMonth] = useHashParam('mois', today().slice(0, 7)),
    [page, setPage] = useHashPage(),
    [adding, setAdding] = useState(false),
    [recording, setRecording] = useState<RevenueSource | null>(null),
    [success, setSuccess] = useState('')
  const load = useCallback(() => call((client) => client.revenue.list({ query: { month, page } })), [month, page])
  const result = useQuery(`revenue:${month}:${page}`, load)
  const pagination = useTablePagination<RevenueSource>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des sources',
  })
  const go = (next: string) => {
    setMonth(next)
    setPage(1)
  }
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Prestations</Heading>
            <Text color="secondary">Chiffre d’affaires mensuel des services proposés dans la résidence.</Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Récapitulatif et export" href="#services/annee" />
            <Button label="Ajouter une source" variant="primary" onClick={() => setAdding(true)} />
          </HStack>
        </HStack>
      }
    >
      <PeriodNav
        label="Navigation par mois"
        previous="Précédent"
        current="Mois courant"
        next="Suivant"
        onPrevious={() => go(shiftPeriod(month, -1))}
        onCurrent={() => go(today().slice(0, 7))}
        onNext={() => go(shiftPeriod(month, 1))}
      />
      <Text>
        Suivi de {periodLabel(month)}
        {result.data
          ? ` : ${euros(result.data.month_net)} HT saisis, dont ${euros(result.data.month_gross)} TTC sur les sources TTC ; ${result.data.pending} source${result.data.pending > 1 ? 's' : ''} à saisir.`
          : '.'}
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
              header: 'Source',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Link href={'#services/' + row.id}>{row.name}</Link>
                  <Text type="supporting">
                    {'Saisie ' +
                      vatLabel(row.vat_mode, row.vat_rate) +
                      (row.description ? ' · ' + row.description : '')}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'latest_amount',
              header: 'Dernière saisie',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text>
                    {row.latest_amount === null ? 'Aucune saisie' : amountLabel(row.latest_amount, row.latest_vat_mode)}
                  </Text>
                  {row.latest_period && <Text type="supporting">{periodLabel(row.latest_period)}</Text>}
                </VStack>
              ),
            },
            {
              key: 'month_amount',
              header: 'Mois suivi',
              width: proportional(1),
              renderCell: (row) =>
                row.month_amount === null ? (
                  <Token label="À saisir" color="gray" />
                ) : (
                  <Token label={amountLabel(row.month_amount, row.month_vat_mode)} color="green" />
                ),
            },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(2),
              renderCell: (row) => (
                <HStack gap={2} wrap="wrap">
                  {row.month_amount === null && month <= today().slice(0, 7) && (
                    <Button label="Saisir" aria-label={'Saisir ' + row.name} onClick={() => setRecording(row)} />
                  )}
                  <Button label="Historique" aria-label={'Historique de ' + row.name} href={'#services/' + row.id} />
                </HStack>
              ),
            },
          ]}
        />
      ) : (
        <Text>Aucune source configurée. Ajoutez le café, la laverie ou une autre prestation pour commencer.</Text>
      )}
      {adding && (
        <SourceEditor
          close={() => setAdding(false)}
          saved={() => {
            setAdding(false)
            setSuccess('Source ajoutée.')
            void result.refresh()
          }}
        />
      )}
      {recording && (
        <EntryEditor
          source={recording}
          period={month}
          close={() => setRecording(null)}
          saved={() => {
            setRecording(null)
            setSuccess('Chiffre d’affaires enregistré.')
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}
