import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { today } from '../../src/domain/rules.ts'
import { copyText } from '../lib/clipboard.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { DateField, dateLabel, Loading } from './shared.tsx'

export function Reports() {
  const [date, setDate] = useState(today()),
    [copied, setCopied] = useState(''),
    [manual, setManual] = useState(false)
  const load = useCallback(() => call((client) => client.reports.weekly({ query: { date } })), [date]),
    result = useQuery('report:' + date, load)
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
            Entrées et sorties réelles, états des lieux réalisés et préavis reçus. Les événements uniquement prévus ou
            annulés sont exclus.
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
            {result.data.rows.length} événement{result.data.rows.length > 1 ? 's' : ''}
          </Text>
          {result.data.rows.length ? (
            <Table
              data={[...result.data.rows]}
              columns={[
                { key: 'date', header: 'Date', width: proportional(1), renderCell: (row) => dateLabel(row.date) },
                { key: 'lot', header: 'Lot', width: proportional(1) },
                { key: 'kind', header: 'Type d’événement', width: proportional(2) },
                { key: 'lastName', header: 'Nom', width: proportional(1) },
                { key: 'firstName', header: 'Prénom', width: proportional(1) },
                { key: 'comment', header: 'Commentaire', width: proportional(2) },
              ]}
            />
          ) : (
            <Text>Aucune activité réalisée ou réception de préavis sur cette semaine.</Text>
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
