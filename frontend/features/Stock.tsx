import { useCallback, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Link } from '@astryxdesign/core/Link'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  MonthlyMovements,
  Movement,
  MovementKind,
  StockCategory,
  StockItem,
  StockLevelFilter,
  StockView,
} from '../../src/domain/stock.ts'
import { today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import {
  barRadius,
  chartColors,
  ChartLegend,
  chartMargin,
  chartTooltip,
  gridProps,
  legendProps,
  lineProps,
  negativeBarRadius,
  shortMonth,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from './charts.tsx'
import { DateField, dateLabel, Editor, Feedback, Loading } from './shared.tsx'

const movementLabels = { in: 'Entrée', out: 'Sortie', count: 'Inventaire' }
const withQuantity = (item: StockItem, quantity: number): StockItem => ({
  ...item,
  quantity,
  level: quantity === 0 ? 'out' : quantity <= item.threshold ? 'low' : 'ok',
})
const amount = (value: number, unit: string) => value.toLocaleString('fr-FR') + (unit ? ' ' + unit : '')

function LevelToken({ item }: { item: StockItem }) {
  return item.level === 'out' ? (
    <Token label="Rupture" color="red" size="sm" />
  ) : item.level === 'low' ? (
    <Token label="Stock faible" color="orange" size="sm" />
  ) : (
    <Text type="supporting">Suffisant</Text>
  )
}

function CategoryField({
  value,
  onChange,
  categories,
}: {
  value: readonly string[]
  onChange: (value: string[]) => void
  categories: readonly string[]
}) {
  const [created, setCreated] = useState<string[]>([])
  const options = [...new Set([...categories, ...value, ...created])]
  return (
    <MultiSelector
      label="Catégories"
      description="Un article peut appartenir à plusieurs catégories, par exemple Stock commun et Stock Coworking. Tapez un nom absent de la liste pour créer une catégorie."
      isOptional
      options={options.map((name) => ({ value: name, label: name }))}
      value={[...value]}
      onChange={(next, change) => {
        if (change?.type === 'create') setCreated((current) => [...current, change.query.trim()])
        onChange(next.map((name) => name.trim()).filter(Boolean))
      }}
      hasSearch
      hasCreate
      searchPlaceholder="Rechercher ou créer une catégorie"
      placeholder="Aucune catégorie"
      emptyText="Tapez un nom pour créer la première catégorie."
      emptySearchText="Aucune catégorie trouvée."
      triggerDisplay="badges"
    />
  )
}

function ItemEditor({
  item,
  categories,
  initialCategories = [],
  close,
  saved,
}: {
  item?: StockItem
  categories: readonly string[]
  initialCategories?: readonly string[]
  close: () => void
  saved: (values: { name: string; categories: string[]; unit: string; threshold: number }) => void
}) {
  const [name, setName] = useState(item?.name ?? ''),
    [itemCategories, setItemCategories] = useState<string[]>([...(item?.categories ?? initialCategories)]),
    [unit, setUnit] = useState(item?.unit ?? ''),
    [threshold, setThreshold] = useState(item?.threshold ?? 0),
    [initial, setInitial] = useState(0)
  const mutation = useMutation()
  return (
    <Editor
      title={item ? 'Modifier l’article' : 'Ajouter un article'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim()}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              item
                ? client.stock.update({
                    params: { id: item.id },
                    payload: { name, categories: itemCategories, unit, threshold },
                  })
                : client.stock.create({ payload: { name, categories: itemCategories, unit, threshold, initial } }),
            ),
          () => saved({ name: name.trim(), categories: itemCategories, unit: unit.trim(), threshold }),
        )
      }
    >
      <TextInput
        label="Nom de l’article"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Couette, tabouret, brosse à toilette…"
      />
      <CategoryField value={itemCategories} onChange={setItemCategories} categories={categories} />
      <TextInput label="Unité" value={unit} onChange={setUnit} isOptional placeholder="pièces, rouleaux, lots…" />
      <NumberInput
        label="Seuil d’alerte"
        description="L’article est signalé en stock faible lorsque la quantité atteint ce seuil."
        value={threshold}
        onChange={(value) => setThreshold(value ?? 0)}
        min={0}
        max={1000000}
        isIntegerOnly
        hasNumberSteppers
      />
      {!item && (
        <NumberInput
          label="Quantité en stock aujourd’hui"
          value={initial}
          onChange={(value) => setInitial(value ?? 0)}
          min={0}
          max={1000000}
          isIntegerOnly
          hasNumberSteppers
        />
      )}
    </Editor>
  )
}

function MovementEditor({
  item,
  initialKind,
  close,
  saved,
}: {
  item: StockItem
  initialKind: MovementKind
  close: () => void
  saved: () => void
}) {
  const [kind, setKind] = useState<MovementKind>(initialKind),
    [quantity, setQuantity] = useState(initialKind === 'count' ? item.quantity : 1),
    [date, setDate] = useState(today()),
    [comment, setComment] = useState('')
  const mutation = useMutation()
  const after = kind === 'count' ? quantity : kind === 'in' ? item.quantity + quantity : item.quantity - quantity
  const invalid = (kind !== 'count' && quantity < 1) || after < 0
  return (
    <Editor
      title={kind === 'count' ? 'Mettre à jour le stock' : 'Enregistrer une ' + movementLabels[kind].toLowerCase()}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={invalid || !date}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.stock.move({ params: { id: item.id }, payload: { kind, quantity, occurred_on: date, comment } }),
            ),
          saved,
        )
      }
    >
      <Text>
        {item.name} · en stock : {amount(item.quantity, item.unit)}
      </Text>
      <SegmentedControl
        label="Type de mouvement"
        value={kind}
        onChange={(value) => {
          setKind(value as MovementKind)
          setQuantity(value === 'count' ? item.quantity : 1)
        }}
      >
        <SegmentedControlItem value="in" label="Entrée" />
        <SegmentedControlItem value="out" label="Sortie" />
        <SegmentedControlItem value="count" label="Inventaire" />
      </SegmentedControl>
      <NumberInput
        label={kind === 'count' ? 'Quantité comptée' : kind === 'in' ? 'Quantité reçue' : 'Quantité sortie'}
        value={quantity}
        onChange={(value) => setQuantity(value ?? 0)}
        min={kind === 'count' ? 0 : 1}
        max={1000000}
        isIntegerOnly
        hasNumberSteppers
        hasAutoFocus
        units={item.unit || null}
      />
      {after < 0 ? (
        <Feedback error={'Stock insuffisant : ' + amount(item.quantity, item.unit) + ' disponible(s).'} />
      ) : (
        <Text color="secondary">
          Stock après enregistrement : {amount(after, item.unit)}
          {kind === 'count' && after !== item.quantity
            ? ' (écart de ' + (after > item.quantity ? '+' : '') + (after - item.quantity) + ')'
            : ''}
          .
        </Text>
      )}
      <DateField label="Date" value={date} onChange={setDate} past />
      <TextInput
        label="Commentaire"
        value={comment}
        onChange={setComment}
        isOptional
        placeholder={kind === 'out' ? 'Lot 204, remplacement…' : kind === 'in' ? 'Livraison, fournisseur…' : ''}
      />
    </Editor>
  )
}

function ThresholdEditor({
  item,
  close,
  saved,
}: {
  item: StockItem
  close: () => void
  saved: (threshold: number) => void
}) {
  const [threshold, setThreshold] = useState(item.threshold)
  const mutation = useMutation()
  const preview = withQuantity({ ...item, threshold }, item.quantity)
  return (
    <Editor
      title={'Seuil d’alerte · ' + item.name}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              client.stock.update({
                params: { id: item.id },
                payload: { name: item.name, categories: item.categories, unit: item.unit, threshold },
              }),
            ),
          () => saved(threshold),
        )
      }
    >
      <NumberInput
        label="Seuil d’alerte"
        description="L’article est signalé en stock faible lorsque la quantité atteint ce seuil."
        value={threshold}
        onChange={(value) => setThreshold(value ?? 0)}
        min={0}
        max={1000000}
        isIntegerOnly
        hasNumberSteppers
        hasAutoFocus
        units={item.unit || null}
      />
      <HStack gap={2} vAlign="center">
        <Text>En stock : {amount(item.quantity, item.unit)}</Text>
        <LevelToken item={preview} />
      </HStack>
    </Editor>
  )
}

function DeleteDialog({ item, close, removed }: { item: StockItem; close: () => void; removed: () => void }) {
  const mutation = useMutation()
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !mutation.busy) close()
      }}
      title={'Supprimer « ' + item.name + ' » ?'}
      description={
        mutation.error ||
        'L’article et tout son historique de mouvements seront définitivement supprimés. Cette action est irréversible.'
      }
      actionLabel="Supprimer définitivement"
      cancelLabel="Annuler"
      isActionLoading={mutation.busy}
      onAction={() =>
        void mutation.run(() => call((client) => client.stock.remove({ params: { id: item.id } })), removed)
      }
    />
  )
}

function ViewEditor({
  view,
  categories,
  close,
  saved,
}: {
  view?: StockView
  categories: readonly StockCategory[]
  close: () => void
  saved: (id: string | null) => void
}) {
  const [name, setName] = useState(view?.name ?? ''),
    [ids, setIds] = useState<string[]>([...(view?.categories ?? [])])
  const mutation = useMutation()
  return (
    <Editor
      title={view ? 'Modifier la vue' : 'Nouvelle vue'}
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!name.trim() || !ids.length}
      submit={() =>
        void mutation.run(
          () =>
            call((client) =>
              view
                ? client.stock.updateView({ params: { id: view.id }, payload: { name, categories: ids } })
                : client.stock.createView({ payload: { name, categories: ids } }),
            ),
          () => saved(view?.id ?? null),
        )
      }
    >
      <TextInput
        label="Nom de la vue"
        value={name}
        onChange={setName}
        isRequired
        hasAutoFocus
        placeholder="Coworking"
      />
      <MultiSelector
        label="Catégories regroupées"
        description="La vue affiche les articles qui appartiennent à au moins une de ces catégories."
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        value={ids}
        onChange={setIds}
        hasSearch
        searchPlaceholder="Rechercher une catégorie"
        placeholder="Aucune catégorie"
        emptyText="Créez d’abord une catégorie depuis un article."
        triggerDisplay="badges"
        isRequired
      />
    </Editor>
  )
}

function ViewDeleteDialog({ view, close, removed }: { view: StockView; close: () => void; removed: () => void }) {
  const mutation = useMutation()
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !mutation.busy) close()
      }}
      title={'Supprimer la vue « ' + view.name + ' » ?'}
      description={mutation.error || 'Seul l’onglet disparaît : les articles et leurs catégories sont conservés.'}
      actionLabel="Supprimer la vue"
      cancelLabel="Annuler"
      isActionLoading={mutation.busy}
      onAction={() =>
        void mutation.run(() => call((client) => client.stock.removeView({ params: { id: view.id } })), removed)
      }
    />
  )
}

export function StockDetail({ id }: { id: string }) {
  const loadItem = useCallback(() => call((client) => client.stock.detail({ params: { id } })), [id]),
    detail = useQuery('stock-item:' + id, loadItem),
    loadCategories = useCallback(() => call((client) => client.stock.list({ query: {} })), []),
    list = useQuery('stock-categories', loadCategories)
  useDetailCrumb(detail.data?.name ?? '')
  if (!detail.data)
    return (
      <PageLayout header={<Heading level={1}>Fiche de l’article</Heading>}>
        <Loading error={detail.error} retry={() => void detail.refresh()} />
      </PageLayout>
    )
  return (
    <ItemHistory
      item={detail.data}
      categories={(list.data?.categories ?? []).map((category) => category.name)}
      changed={() => void detail.refresh()}
    />
  )
}

const signed = (value: number) => (value > 0 ? '+' : '') + value.toLocaleString('fr-FR')
const monthName = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01'))

type TrendRow = MonthlyMovements & { label: string; outflow: number }
const compactCount = (value: number) => value.toLocaleString('fr-FR', { notation: 'compact' })
const trendTitle = (row: TrendRow) => monthName(row.month)

function MovementChart({ months, unit }: { months: ReadonlyArray<MonthlyMovements>; unit: string }) {
  const data: TrendRow[] = months.map((month) => ({ ...month, label: shortMonth(month.month), outflow: -month.exits }))
  return (
    <VStack gap={3}>
      <Text size="sm" color="secondary">
        Stock en fin de mois
      </Text>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={data}
          syncId="stock-trend"
          margin={chartMargin}
          accessibilityLayer
          title="Stock en fin de mois"
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" hide />
          <YAxis {...yAxisProps} allowDecimals={false} tickFormatter={compactCount} />
          <Tooltip
            {...tooltipProps}
            cursor={{ stroke: 'var(--color-border)' }}
            content={chartTooltip<TrendRow>(
              trendTitle,
              (value) => (typeof value === 'number' ? amount(value, unit) : '—'),
              (row) =>
                row.adjustments
                  ? [
                      {
                        key: 'adjustments',
                        color: chartColors.muted,
                        label: 'Écart d’inventaire',
                        value: signed(row.adjustments),
                      },
                    ]
                  : [],
            )}
          />
          <Area
            dataKey="stock"
            name="Stock fin de mois"
            stroke={chartColors.blue}
            fill={chartColors.blue}
            fillOpacity={0.15}
            {...lineProps}
          />
        </AreaChart>
      </ResponsiveContainer>
      <Text size="sm" color="secondary">
        Entrées et sorties
      </Text>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          syncId="stock-trend"
          margin={chartMargin}
          stackOffset="sign"
          accessibilityLayer
          title="Entrées et sorties par mois"
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...xAxisProps} />
          <YAxis {...yAxisProps} allowDecimals={false} tickFormatter={compactCount} />
          <ReferenceLine y={0} stroke="var(--color-border)" />
          <Tooltip
            {...tooltipProps}
            content={chartTooltip<TrendRow>(trendTitle, (value) => (typeof value === 'number' ? signed(value) : '—'))}
          />
          <Legend {...legendProps} content={<ChartLegend />} />
          <Bar
            stackId="flow"
            dataKey="entries"
            name="Entrées"
            fill={chartColors.teal}
            radius={barRadius}
            maxBarSize={40}
          />
          <Bar
            stackId="flow"
            dataKey="outflow"
            name="Sorties"
            fill={chartColors.orange}
            radius={negativeBarRadius}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </VStack>
  )
}

function MovementTrend({ item, version }: { item: StockItem; version: number }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const load = useCallback(
    () => call((client) => client.stock.trend({ params: { id: item.id }, query: { year } })),
    [item.id, year],
  )
  const result = useQuery(`stock-trend:${item.id}:${year}:${version}`, load)
  return (
    <VStack gap={3}>
      <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
        <Heading level={2}>Variation {year}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Année précédente" onClick={() => setYear(year - 1)} />
          <Button label="Année courante" onClick={() => setYear(Number(today().slice(0, 4)))} />
          <Button label="Année suivante" onClick={() => setYear(year + 1)} />
        </HStack>
      </HStack>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <Card>
          <VStack gap={2}>
            <Text type="label">
              Entrées {signed(result.data.entries)} · sorties {signed(-result.data.exits)} · inventaires{' '}
              {signed(result.data.adjustments)}
            </Text>
            <MovementChart months={result.data.months} unit={item.unit} />
          </VStack>
        </Card>
      )}
    </VStack>
  )
}

function ItemHistory({
  item,
  categories,
  changed,
}: {
  item: StockItem
  categories: readonly string[]
  changed: () => void
}) {
  const [page, setPage] = useState(1),
    [moving, setMoving] = useState<MovementKind | null>(null),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [success, setSuccess] = useState(''),
    [version, setVersion] = useState(0)
  const load = useCallback(
    () => call((client) => client.stock.movements({ params: { id: item.id }, query: { page } })),
    [item.id, page],
  )
  const result = useQuery(`stock:${item.id}:${page}`, load)
  const pagination = useTablePagination<Movement>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des mouvements',
  })
  return (
    <PageLayout
      header={
        <VStack gap={3}>
          <HStack gap={3} wrap="wrap" hAlign="between">
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Heading level={1}>{item.name}</Heading>
                <LevelToken item={item} />
              </HStack>
              <Text>
                En stock : {amount(item.quantity, item.unit)} · seuil {item.threshold}
                {item.categories.length ? ' · ' + item.categories.join(', ') : ''}
              </Text>
            </VStack>
            <HStack gap={2} wrap="wrap">
              <Button label="Supprimer" variant="destructive" onClick={() => setDeleting(true)} />
              <Button label="Modifier" onClick={() => setEditing(true)} />
              <Button label="Entrée" onClick={() => setMoving('in')} />
              <Button label="Sortie" onClick={() => setMoving('out')} />
              <Button label="Mettre à jour le stock" variant="primary" onClick={() => setMoving('count')} />
            </HStack>
          </HStack>
        </VStack>
      }
    >
      <Feedback success={success} />
      <MovementTrend item={item} version={version} />
      <Heading level={2}>Mouvements</Heading>
      {deleting && (
        <DeleteDialog
          item={item}
          close={() => setDeleting(false)}
          removed={() => {
            window.location.hash = '#stock'
          }}
        />
      )}
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
              key: 'occurred_on',
              header: 'Date',
              width: proportional(1),
              renderCell: (row) => <Text>{dateLabel(row.occurred_on)}</Text>,
            },
            {
              key: 'kind',
              header: 'Mouvement',
              width: proportional(1),
              renderCell: (row) => <Text>{movementLabels[row.kind]}</Text>,
            },
            {
              key: 'delta',
              header: 'Variation',
              width: proportional(1),
              renderCell: (row) => <Text>{(row.delta > 0 ? '+' : '') + row.delta.toLocaleString('fr-FR')}</Text>,
            },
            {
              key: 'quantity_after',
              header: 'Stock après',
              width: proportional(1),
              renderCell: (row) => <Text>{amount(row.quantity_after, item.unit)}</Text>,
            },
            { key: 'comment', header: 'Commentaire', width: proportional(2) },
            { key: 'actor', header: 'Saisi par', width: proportional(1) },
          ]}
        />
      ) : (
        <Text>Aucun mouvement pour cet article.</Text>
      )}
      {moving && (
        <MovementEditor
          item={item}
          initialKind={moving}
          close={() => setMoving(null)}
          saved={() => {
            setSuccess(moving === 'count' ? 'Stock mis à jour.' : 'Mouvement enregistré.')
            setMoving(null)
            setPage(1)
            setVersion((current) => current + 1)
            void result.refresh()
            changed()
          }}
        />
      )}
      {editing && (
        <ItemEditor
          item={item}
          categories={categories}
          close={() => setEditing(false)}
          saved={() => {
            setSuccess('Article modifié.')
            setEditing(false)
            changed()
          }}
        />
      )}
    </PageLayout>
  )
}

export function Stock({ view }: { view: string }) {
  const [q, setQ] = useState(''),
    [category, setCategory] = useState(''),
    [level, setLevel] = useState<StockLevelFilter>('all'),
    [page, setPage] = useState(1),
    [adding, setAdding] = useState(false),
    [moving, setMoving] = useState<{ item: StockItem; kind: MovementKind } | null>(null),
    [thresholdFor, setThresholdFor] = useState<StockItem | null>(null),
    [editing, setEditing] = useState<StockItem | null>(null),
    [deleting, setDeleting] = useState<StockItem | null>(null),
    [viewEditor, setViewEditor] = useState<StockView | 'new' | null>(null),
    [deletingView, setDeletingView] = useState<StockView | null>(null),
    [success, setSuccess] = useState(''),
    [shownView, setShownView] = useState(view)
  if (shownView !== view) {
    setShownView(view)
    setCategory('')
    setPage(1)
    setSuccess('')
  }
  const load = useCallback(
    () => call((client) => client.stock.list({ query: { q, category, view, level, page } })),
    [q, category, view, level, page],
  )
  const result = useQuery(`stock:${view}:${q}:${category}:${level}:${page}`, load)
  const pagination = useTablePagination<StockItem>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des articles',
  })
  const categories = result.data?.categories ?? []
  const categoryNames = categories.map((item) => item.name)
  const views = result.data?.views ?? []
  const current = views.find((item) => item.id === view)
  const scopedCategories = current ? categories.filter((item) => current.categories.includes(item.id)) : categories
  useDetailCrumb(current?.name ?? '')
  const low = result.data?.low ?? 0
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Stocks</Heading>
            <Text color="secondary">Réserve d’équipements et de consommables de la résidence.</Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Nouvelle vue" onClick={() => setViewEditor('new')} />
            <Button label="Ajouter un article" variant="primary" onClick={() => setAdding(true)} />
          </HStack>
        </HStack>
      }
      navigation={
        views.length > 0 ? (
          <HStack gap={2} vAlign="end" hAlign="between" wrap="wrap">
            <TabList value={view || 'all'} onChange={() => undefined}>
              <Tab value="all" label="Tous les articles" href="#stock" />
              {views.map((item) => (
                <Tab
                  key={item.id}
                  value={item.id}
                  label={item.name}
                  href={'#stock?vue=' + encodeURIComponent(item.id)}
                  endContent={item.low > 0 ? <Badge variant="warning" label={item.low} /> : undefined}
                />
              ))}
            </TabList>
            {current && (
              <MoreMenu
                label={'Actions de la vue ' + current.name}
                alignment="end"
                items={[
                  { label: 'Modifier la vue', onClick: () => setViewEditor(current) },
                  { label: 'Supprimer la vue', variant: 'destructive', onClick: () => setDeletingView(current) },
                ]}
              />
            )}
          </HStack>
        ) : undefined
      }
    >
      {view && result.data && !current && <Feedback error="Cette vue n’existe plus. Revenez à tous les articles." />}
      {low > 0 && level === 'all' && (
        <Banner
          status="warning"
          title={low === 1 ? '1 article à réapprovisionner' : low + ' articles à réapprovisionner'}
          description="Articles en rupture ou dont la quantité a atteint le seuil d’alerte. Ils sont affichés en premier."
          endContent={
            <Button
              label="Afficher uniquement ceux-ci"
              onClick={() => {
                setLevel('alert')
                setPage(1)
              }}
            />
          }
        />
      )}
      <HStack gap={3} wrap="wrap" vAlign="end">
        <TextInput
          label="Rechercher un article"
          value={q}
          onChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          hasClear
          placeholder="Nom ou catégorie"
        />
        <Selector
          label="Catégorie"
          value={category || 'all'}
          onChange={(value) => {
            setCategory(value === 'all' ? '' : value)
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'Toutes les catégories' },
            ...scopedCategories.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <SegmentedControl
          label="Articles affichés"
          value={level}
          onChange={(value) => {
            setLevel(value === 'alert' ? 'alert' : 'all')
            setPage(1)
          }}
        >
          <SegmentedControlItem value="all" label="Tous" />
          <SegmentedControlItem value="alert" label={'À réapprovisionner (' + low + ')'} />
        </SegmentedControl>
      </HStack>
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
              header: 'Article',
              width: proportional(2),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Link href={'#stock/' + row.id}>{row.name}</Link>
                  {row.categories.length > 0 && <Text type="supporting">{row.categories.join(' · ')}</Text>}
                </VStack>
              ),
            },
            {
              key: 'quantity',
              header: 'En stock',
              width: proportional(1),
              renderCell: (row) => (
                <VStack gap={1}>
                  <Text weight="bold">{amount(row.quantity, row.unit)}</Text>
                  <Text type="supporting">Seuil {row.threshold}</Text>
                </VStack>
              ),
            },
            {
              key: 'level',
              header: 'État',
              width: proportional(1),
              renderCell: (row) => <LevelToken item={row} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              width: proportional(3),
              renderCell: (row) => (
                <HStack gap={2} wrap="wrap">
                  <Button
                    label="Entrée"
                    aria-label={'Entrée de ' + row.name}
                    onClick={() => setMoving({ item: row, kind: 'in' })}
                  />
                  <Button
                    label="Sortie"
                    aria-label={'Sortie de ' + row.name}
                    isDisabled={row.quantity === 0}
                    onClick={() => setMoving({ item: row, kind: 'out' })}
                  />
                  <Button
                    label="Mettre à jour"
                    aria-label={'Mettre à jour le stock de ' + row.name}
                    onClick={() => setMoving({ item: row, kind: 'count' })}
                  />
                  <MoreMenu
                    label={'Autres actions pour ' + row.name}
                    alignment="end"
                    presentation="adaptive"
                    items={[
                      { label: 'Modifier le seuil', onClick: () => setThresholdFor(row) },
                      { label: 'Modifier l’article', onClick: () => setEditing(row) },
                      { label: 'Ouvrir la fiche', href: '#stock/' + row.id },
                      { type: 'divider' },
                      { label: 'Supprimer l’article', variant: 'destructive', onClick: () => setDeleting(row) },
                    ]}
                  />
                </HStack>
              ),
            },
          ]}
        />
      ) : q || category || level !== 'all' ? (
        <Text>Aucun article ne correspond à ces critères.</Text>
      ) : current ? (
        <Text>Aucun article dans la vue {current.name}.</Text>
      ) : (
        <Text>Aucun article. Ajoutez le premier : couette, tabouret, brosse à toilette…</Text>
      )}
      {adding && (
        <ItemEditor
          categories={categoryNames}
          initialCategories={scopedCategories.length === 1 && current ? [scopedCategories[0]!.name] : []}
          close={() => setAdding(false)}
          saved={() => {
            setAdding(false)
            setSuccess('Article ajouté.')
            void result.refresh()
          }}
        />
      )}
      {moving && (
        <MovementEditor
          item={moving.item}
          initialKind={moving.kind}
          close={() => setMoving(null)}
          saved={() => {
            setSuccess(moving.kind === 'count' ? 'Stock mis à jour.' : 'Mouvement enregistré.')
            setMoving(null)
            void result.refresh()
          }}
        />
      )}
      {viewEditor && (
        <ViewEditor
          view={viewEditor === 'new' ? undefined : viewEditor}
          categories={categories}
          close={() => setViewEditor(null)}
          saved={(id) => {
            setViewEditor(null)
            setSuccess(id ? 'Vue modifiée.' : 'Vue créée.')
            void result.refresh()
          }}
        />
      )}
      {deletingView && (
        <ViewDeleteDialog
          view={deletingView}
          close={() => setDeletingView(null)}
          removed={() => {
            setDeletingView(null)
            window.location.hash = '#stock'
          }}
        />
      )}
      {thresholdFor && (
        <ThresholdEditor
          item={thresholdFor}
          close={() => setThresholdFor(null)}
          saved={(threshold) => {
            setSuccess('Seuil de « ' + thresholdFor.name + ' » fixé à ' + threshold + '.')
            setThresholdFor(null)
            void result.refresh()
          }}
        />
      )}
      {editing && (
        <ItemEditor
          item={editing}
          categories={categoryNames}
          close={() => setEditing(null)}
          saved={() => {
            setSuccess('Article modifié.')
            setEditing(null)
            void result.refresh()
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          item={deleting}
          close={() => setDeleting(null)}
          removed={() => {
            setSuccess('« ' + deleting.name + ' » supprimé.')
            setDeleting(null)
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}
