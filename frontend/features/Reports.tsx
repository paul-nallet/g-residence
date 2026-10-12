import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { today } from '../../src/domain/rules.ts'
import { REPORT_PAGE_SIZE, type ReportRow } from '../../src/domain/agenda.ts'
import { copyText } from '../lib/clipboard.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { DateField, dateLabel, Loading } from './shared.tsx'

export function Reports() {
  const [date, setDate] = useState(today()),
    [page, setPage] = useState(1),
    [copied, setCopied] = useState(''),
    [manual, setManual] = useState(false)
  const load = useCallback(() => call((client) => client.reports.weekly({ query: { date, page } })), [date, page]),
    result = useQuery(`report:${date}:${page}`, load)
  const pagination = useTablePagination<ReportRow>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: REPORT_PAGE_SIZE,
    variant: 'pages',
    label: 'Pagination du bilan',
  })
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
  return (
    <PageLayout
      header={
        <VStack gap={2}>
          <Heading level={1}>Bilan hebdomadaire</Heading>
          <Text color="secondary">
            Activité de la résidence : mouvements, ménage, technique, stocks, relevés, prestations, lots et retours de
            l’équipe. Les comptes créés sont visibles pour les administrateurs.
          </Text>
        </VStack>
      }
    >
      <HStack gap={3} wrap="wrap" vAlign="end">
        <DateField
          label="Une date de la semaine"
          value={date}
          onChange={(value) => {
            if (value) {
              setDate(value)
              setPage(1)
              setCopied('')
              setManual(false)
            }
          }}
        />
        <Button
          label="Régénérer le bilan"
          onClick={() => {
            setCopied('')
            setManual(false)
            void result.refresh()
          }}
        />
      </HStack>
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <Heading level={2}>
            Du {dateLabel(result.data.from)} au {dateLabel(result.data.to)}
          </Heading>
          <Text>
            {result.data.total} événement{result.data.total > 1 ? 's' : ''}
          </Text>
          <Text color="secondary">
            Réalisations et constats à leur date réelle, journal et retours à leur date d’ajout. Les prestations
            apparaissent à la date de saisie ou de correction, avec leur mois et leur montant HT ou TTC. Le calendrier
            est inclus via les états des lieux et interventions réalisés. Les activités seulement prévues ou annulées
            sont exclues.
          </Text>
          {result.data.rows.length ? (
            <Table
              data={[...result.data.rows]}
              rowCount={result.data.total}
              rowIndexStart={(page - 1) * REPORT_PAGE_SIZE + 1}
              plugins={{ pagination }}
              columns={[
                { key: 'date', header: 'Date', width: proportional(1), renderCell: (row) => dateLabel(row.date) },
                { key: 'module', header: 'Module', width: proportional(1) },
                { key: 'lot', header: 'Lot', width: proportional(1) },
                { key: 'subject', header: 'Objet / lieu', width: proportional(2) },
                { key: 'kind', header: 'Type d’événement', width: proportional(2) },
                { key: 'actor', header: 'Intervenant', width: proportional(1) },
                { key: 'lastName', header: 'Nom', width: proportional(1) },
                { key: 'firstName', header: 'Prénom', width: proportional(1) },
                { key: 'comment', header: 'Commentaire', width: proportional(2) },
              ]}
            />
          ) : (
            <Text>Aucune activité enregistrée sur cette semaine.</Text>
          )}
          <Button label="Copier tout le bilan pour Excel" variant="primary" onClick={() => void copy()} />
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
