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
import type { RevenueEntry, RevenueSource, RevenueYearRow } from '../../src/domain/revenue.ts'
import { today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
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
    [description, setDescription] = useState(source?.description ?? '')
  const mutation = useMutation()
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
                ? client.revenue.update({ params: { id: source.id }, payload: { name, description } })
                : client.revenue.create({ payload: { name, description } }),
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
        label="Chiffre d’affaires du mois (€)"
        value={amount}
        onChange={setAmount}
        isRequired
        hasAutoFocus
        placeholder="Ex. 1 234,50"
      />
      {amount && cents === null && (
        <Feedback error="Saisissez un montant positif ou nul, avec au plus deux décimales." />
      )}
      <TextInput label="Commentaire" value={comment} onChange={setComment} isOptional />
      {!entry && source.latest_period && source.latest_amount !== null && (
        <Text color="secondary">
          Dernière saisie : {euros(source.latest_amount)} en {periodLabel(source.latest_period)}.
        </Text>
      )}
    </Editor>
  )
}

const tooltipValue = (value: unknown) => (typeof value === 'number' ? money.format(value) : 'Aucune saisie')

function RevenueChart({ year, months }: { year: number; months: ReadonlyArray<number | null> }) {
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
        title={`Chiffre d’affaires ${year} par mois et cumul annuel`}
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
          name="CA du mois"
          fill={chartColors.blue}
          radius={barRadius}
          maxBarSize={40}
        />
        <Line
          yAxisId="cumulative"
          dataKey="cumulative"
          name="Cumul annuel"
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
              Total {year} : {euros(row?.total ?? 0)}
            </Text>
            <RevenueChart year={year} months={row?.months ?? Array.from({ length: 12 }, () => null)} />
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
            <Heading level={1}>{source.name}</Heading>
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
              header: 'Chiffre d’affaires',
              width: proportional(1),
              renderCell: (row) => <Text>{euros(row.amount_cents)}</Text>,
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
          <Text color="secondary">Chiffre d’affaires de chaque source, mois par mois, prêt à coller dans Excel.</Text>
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
                Total {year} : {euros(result.data.total)}
              </Text>
              <RevenueChart
                year={year}
                months={result.data.months.map((value, index) =>
                  result.data!.rows.some((row) => row.months[index] !== null) ? value : null,
                )}
              />
            </VStack>
          </Card>
          {result.data.rows.length ? (
            <Table
              data={[
                ...result.data.rows,
                { id: 'total', name: 'Total', months: result.data.months, total: result.data.total },
              ]}
              idKey="id"
              dividers="rows"
              columns={[
                {
                  key: 'name',
                  header: 'Source',
                  width: proportional(2),
                  renderCell: (row: RevenueYearRow) =>
                    row.id === 'total' ? (
                      <Text type="label">Total</Text>
                    ) : (
                      <Link href={'#services/' + row.id}>{row.name}</Link>
                    ),
                },
                ...periods.map((period, index) => ({
                  key: period,
                  header: periodLabel(period, 'short'),
                  width: proportional(1),
                  renderCell: (row: RevenueYearRow) => (
                    <Text>{row.months[index] === null ? '—' : euros(row.months[index]!)}</Text>
                  ),
                })),
                {
                  key: 'total',
                  header: 'Total',
                  width: proportional(1),
                  renderCell: (row: RevenueYearRow) => <Text type="label">{euros(row.total)}</Text>,
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
  const [month, setMonth] = useState(today().slice(0, 7)),
    [page, setPage] = useState(1),
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
          ? ` : ${euros(result.data.month_total)} saisis, ${result.data.pending} source${result.data.pending > 1 ? 's' : ''} à saisir.`
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
                  {row.description && <Text type="supporting">{row.description}</Text>}
                </VStack>
              ),
            },
            {
              key: 'latest_amount',
              header: 'Dernière saisie',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text>{row.latest_amount === null ? 'Aucune saisie' : euros(row.latest_amount)}</Text>
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
                  <Token label={euros(row.month_amount)} color="green" />
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
