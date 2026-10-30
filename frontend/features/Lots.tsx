import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { List, ListItem } from '@astryxdesign/core/List'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Token } from '@astryxdesign/core/Token'
import { Link } from '@astryxdesign/core/Link'
import {
  CleanlinessFilter,
  type Lot,
  LotArchiveFilter,
  type LotRow,
  LotSort,
  LotStateFilter,
} from '../../src/domain/lots.ts'
import { cleanlinessLabels, CleanlinessToken, hasCleanliness } from './readiness.tsx'
import type { Me } from '../../src/domain/accounts.ts'
import { call } from '../lib/api.ts'
import { useHashPage, useHashParam } from '../lib/hashParams.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { today } from '../../src/domain/rules.ts'
import { dateLabel, Editor, Feedback, Loading, StateToken } from './shared.tsx'

const loadBuildings = () => call((client) => client.buildings.list())

function BuildingEditor({ close, saved }: { close: () => void; saved: () => void }) {
  const [name, setName] = useState('')
  const result = useQuery('buildings', loadBuildings)
  const mutation = useMutation()
  return (
    <Editor
      title="Bâtiments de la résidence"
      close={close}
      label="Ajouter le bâtiment"
      busy={mutation.busy}
      error={mutation.error}
      submit={() => void mutation.run(() => call((client) => client.buildings.create({ payload: { name } })), saved)}
    >
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : result.data.length ? (
        <List hasDividers>
          {result.data.map((building) => (
            <ListItem key={building.id} label={building.name} />
          ))}
        </List>
      ) : (
        <Text>Créez un bâtiment avant d’ajouter des lots à la résidence.</Text>
      )}
      <TextInput label="Nom du nouveau bâtiment" value={name} onChange={setName} isRequired hasAutoFocus />
    </Editor>
  )
}

export function LotEditor({ lot, close, saved }: { lot?: Lot; close: () => void; saved: () => void }) {
  const [number, setNumber] = useState(lot?.number ?? ''),
    [floor, setFloor] = useState(lot?.floor ?? ''),
    [type, setType] = useState(lot?.type ?? ''),
    [buildingId, setBuildingId] = useState(lot?.building_id ?? '')
  const buildings = useQuery('buildings', loadBuildings)
  const mutation = useMutation()
  const selectedBuildingId = buildingId || (buildings.data?.length === 1 ? buildings.data[0]!.id : '')
  const submit = () =>
    selectedBuildingId &&
    mutation.run(
      () =>
        lot
          ? call((client) =>
              client.lots.update({
                params: { id: lot.id },
                payload: { number, floor, type, building_id: selectedBuildingId },
              }),
            )
          : call((client) => client.lots.create({ payload: { number, floor, type, building_id: selectedBuildingId } })),
      saved,
    )
  if (buildings.data && !buildings.data.length)
    return <BuildingEditor close={close} saved={() => void buildings.refresh()} />
  return (
    <Editor
      title={lot ? 'Modifier le lot' : 'Ajouter un lot'}
      disabled={!buildings.data || !selectedBuildingId}
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
    >
      <TextInput label="Numéro du lot" value={number} onChange={setNumber} isRequired hasAutoFocus />
      {!buildings.data ? (
        <Loading error={buildings.error} retry={() => void buildings.refresh()} />
      ) : (
        <Selector
          label="Bâtiment"
          value={selectedBuildingId}
          isRequired
          placeholder="Choisir un bâtiment"
          onChange={setBuildingId}
          options={buildings.data.map((building) => ({ value: building.id, label: building.name }))}
        />
      )}
      <TextInput label="Étage" value={floor} onChange={setFloor} isOptional />
      <TextInput label="Type de logement" value={type} onChange={setType} isOptional placeholder="Studio, T1…" />
    </Editor>
  )
}
const stayDates = (row: LotRow) =>
  row.occupancy === 'planned'
    ? 'Entrée prévue le ' + dateLabel(row.stay_start ?? '')
    : row.stay_end
      ? (row.notice ? 'Départ le ' : 'Fin prévue le ') + dateLabel(row.stay_end)
      : 'Depuis le ' + dateLabel(row.stay_start ?? '')

export function Lots({ me }: { me: Me }) {
  const [q, setQ] = useHashParam('q', ''),
    [state, setState] = useHashParam<LotStateFilter>('occupation', 'all'),
    [building, setBuilding] = useHashParam('batiment', 'all'),
    [cleanliness, setCleanliness] = useHashParam<CleanlinessFilter>('proprete', 'all'),
    [buildingEditor, setBuildingEditor] = useState(false),
    [archived, setArchived] = useHashParam<LotArchiveFilter>('archives', 'no'),
    [sort, setSort] = useHashParam<LotSort>('tri', 'number'),
    [page, setPage] = useHashPage(),
    [editor, setEditor] = useState<Lot | 'new' | null>(null)
  const load = useCallback(
    () => call((client) => client.lots.list({ query: { q, state, building, cleanliness, archived, sort, page } })),
    [q, state, building, cleanliness, archived, sort, page],
  )
  const result = useQuery(`lots:${q}:${state}:${building}:${cleanliness}:${archived}:${sort}:${page}`, load)
  const buildings = useQuery('buildings', loadBuildings)
  const pagination = useTablePagination<LotRow>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    align: 'end',
    label: 'Pagination des lots',
  })
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Lots et mouvements</Heading>
            <Text color="secondary">Les appartements et leurs occupations successives.</Text>
          </VStack>
          {me.role !== 'cleaner' && (
            <HStack gap={2} wrap="wrap">
              <Button label="Bâtiments" onClick={() => setBuildingEditor(true)} />
              <Button
                label={buildings.data?.length === 0 ? 'Créer un bâtiment' : 'Ajouter un lot'}
                variant="primary"
                isDisabled={!buildings.data}
                onClick={() => (buildings.data?.length === 0 ? setBuildingEditor(true) : setEditor('new'))}
              />
            </HStack>
          )}
        </HStack>
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="end">
        <TextInput
          label="Rechercher un lot"
          value={q}
          onChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          hasClear
          placeholder={me.role === 'cleaner' ? 'Numéro, étage, type' : 'Lot, occupant, étage…'}
        />
        <Selector
          label="Bâtiment"
          value={building}
          onChange={(value) => {
            setBuilding(value)
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'Tous les bâtiments' },
            ...(buildings.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Selector
          label="Occupation"
          value={state}
          onChange={(value) => {
            setState(LotStateFilter.literals.find((item) => item === value) ?? 'all')
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'vacant', label: 'Libre' },
            { value: 'planned', label: 'Entrée prévue' },
            { value: 'occupied', label: 'Occupé' },
          ]}
        />
        <Selector
          label="Propreté"
          value={cleanliness}
          onChange={(value) => {
            setCleanliness(CleanlinessFilter.literals.find((item) => item === value) ?? 'all')
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'Tous' },
            ...Object.entries(cleanlinessLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Selector
          label="Lots affichés"
          value={archived}
          onChange={(value) => {
            setArchived(LotArchiveFilter.literals.find((item) => item === value) ?? 'no')
            setPage(1)
          }}
          options={[
            { value: 'no', label: 'Actifs' },
            { value: 'yes', label: 'Archivés' },
          ]}
        />
        <Selector
          label="Trier par"
          value={sort}
          onChange={(value) => {
            setSort(LotSort.literals.find((item) => item === value) ?? 'number')
            setPage(1)
          }}
          options={[
            { value: 'number', label: 'Numéro' },
            { value: 'floor', label: 'Étage' },
          ]}
        />
      </HStack>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <Text type="supporting">
            {result.data.total} lot{result.data.total > 1 ? 's' : ''}
          </Text>
          {result.data.items.length ? (
            <Table
              data={[...result.data.items]}
              idKey="id"
              rowCount={result.data.total}
              rowIndexStart={(page - 1) * 20 + 1}
              plugins={{ pagination }}
              density="balanced"
              dividers="rows"
              hasHover
              columns={[
                {
                  key: 'number',
                  header: 'Lot',
                  width: proportional(1),
                  renderCell: (row) => <Link href={'#lots/' + row.id}>{'Lot ' + row.number}</Link>,
                },
                ...(me.role !== 'cleaner'
                  ? [
                      {
                        key: 'resident',
                        header: 'Occupant',
                        width: proportional(2),
                        renderCell: (row: LotRow) =>
                          row.resident ? (
                            <VStack gap={0}>
                              <Text>{row.resident}</Text>
                              <Text type="supporting">{stayDates(row)}</Text>
                            </VStack>
                          ) : (
                            <Text color="secondary">—</Text>
                          ),
                      },
                    ]
                  : []),
                {
                  key: 'building_name',
                  header: 'Bâtiment',
                  width: proportional(1),
                  renderCell: (row) => <Text>{row.building_name}</Text>,
                },
                { key: 'floor', header: 'Étage', width: proportional(1) },
                { key: 'type', header: 'Type', width: proportional(1) },
                {
                  key: 'occupancy',
                  header: 'Situation',
                  width: proportional(1),
                  renderCell: (row) =>
                    row.archived ? (
                      <Token label="Archivé" color="gray" />
                    ) : (
                      <HStack gap={1} wrap="wrap">
                        <StateToken state={row.occupancy === 'planned' ? 'Entrée prévue' : row.occupancy} />
                        {row.cleanliness !== 'clean' && hasCleanliness(row) && (
                          <CleanlinessToken cleanliness={row.cleanliness} />
                        )}
                        {row.notice ? <Token label="Préavis" color="orange" /> : null}
                        {row.occupancy === 'planned' && row.stay_start && row.stay_start < today() ? (
                          <Token label="Entrée à confirmer" color="red" />
                        ) : null}
                      </HStack>
                    ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  width: pixel(96),
                  align: 'end',
                  renderCell: (row) => (
                    <MoreMenu
                      label={'Actions du lot ' + row.number}
                      alignment="end"
                      presentation="adaptive"
                      items={[
                        { label: 'Ouvrir la fiche', href: '#lots/' + row.id },
                        ...(me.role !== 'cleaner' ? [{ label: 'Modifier le lot', onClick: () => setEditor(row) }] : []),
                      ]}
                    />
                  ),
                },
              ]}
            />
          ) : (
            <Text>
              Aucun lot trouvé.{' '}
              {q || state !== 'all' || building !== 'all' || archived !== 'no'
                ? 'Modifiez les filtres.'
                : me.role === 'cleaner'
                  ? 'Les lots seront ajoutés par la gestion.'
                  : 'Ajoutez votre premier appartement.'}
            </Text>
          )}
          <HStack hAlign="end">
            <Button label="Actualiser" variant="ghost" onClick={() => void result.refresh()} />
          </HStack>
        </>
      )}
      <Feedback error={result.error || buildings.error} />
      {buildingEditor && (
        <BuildingEditor
          close={() => setBuildingEditor(false)}
          saved={() => {
            setBuildingEditor(false)
            void buildings.refresh()
          }}
        />
      )}
      {editor && (
        <LotEditor
          lot={editor === 'new' ? undefined : editor}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null)
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}
