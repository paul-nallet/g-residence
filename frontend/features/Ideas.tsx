import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTablePagination } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Token } from '@astryxdesign/core/Token'
import type { Me } from '../../src/domain/accounts.ts'
import type { FeedbackEntry, FeedbackKind } from '../../src/domain/feedback.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { dateLabel, Editor, Feedback, Loading } from './shared.tsx'

const kinds = {
  idea: { label: 'Idée', plural: 'Idées', color: 'blue' },
  feature: { label: 'Fonctionnalité', plural: 'Fonctionnalités', color: 'green' },
  bug: { label: 'Bug', plural: 'Bugs', color: 'red' },
} as const

function IdeaEditor({ close, saved }: { close: () => void; saved: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('idea'),
    [message, setMessage] = useState('')
  const mutation = useMutation()
  return (
    <Editor
      title="Proposer une idée ou signaler un bug"
      label="Envoyer"
      close={close}
      busy={mutation.busy}
      error={mutation.error}
      disabled={!message.trim()}
      submit={() =>
        void mutation.run(() => call((client) => client.feedback.create({ payload: { kind, message } })), saved)
      }
    >
      <SegmentedControl label="Type de retour" value={kind} onChange={(value) => setKind(value as FeedbackKind)}>
        {Object.entries(kinds).map(([value, { label }]) => (
          <SegmentedControlItem key={value} value={value} label={label} />
        ))}
      </SegmentedControl>
      <TextArea
        label={kind === 'bug' ? 'Que s’est-il passé ?' : 'Votre proposition'}
        description={
          kind === 'bug'
            ? 'Indiquez la page concernée, ce que vous avez fait et ce que vous attendiez.'
            : 'Décrivez le besoin et ce qu’il vous ferait gagner au quotidien.'
        }
        value={message}
        onChange={setMessage}
        isRequired
        hasAutoFocus
        rows={6}
        maxLength={2000}
      />
    </Editor>
  )
}

export function Ideas({ me }: { me: Me }) {
  const [kind, setKind] = useState<FeedbackKind | ''>(''),
    [page, setPage] = useState(1),
    [adding, setAdding] = useState(false),
    [success, setSuccess] = useState('')
  const load = useCallback(
    () => call((client) => client.feedback.list({ query: { page, ...(kind ? { kind } : {}) } })),
    [kind, page],
  )
  const result = useQuery(`feedback:${kind}:${page}`, load)
  const pagination = useTablePagination<FeedbackEntry>({
    page,
    onPageChange: setPage,
    totalItems: result.data?.total ?? 0,
    pageSize: 20,
    variant: 'pages',
    label: 'Pagination des retours',
  })
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>Boîte à idées</Heading>
            <Text color="secondary">
              Proposez une amélioration, demandez une fonctionnalité ou signalez un bug de l’application.
            </Text>
          </VStack>
          <Button
            label="Proposer"
            variant="primary"
            onClick={() => {
              setSuccess('')
              setAdding(true)
            }}
          />
        </HStack>
      }
    >
      <SegmentedControl
        label="Filtrer par type"
        value={kind || 'all'}
        onChange={(value) => {
          setKind(value === 'all' ? '' : (value as FeedbackKind))
          setPage(1)
        }}
      >
        <SegmentedControlItem value="all" label="Tout" />
        {Object.entries(kinds).map(([value, { plural }]) => (
          <SegmentedControlItem key={value} value={value} label={plural} />
        ))}
      </SegmentedControl>
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
              key: 'kind',
              header: 'Type',
              width: proportional(1),
              renderCell: (row) => <Token label={kinds[row.kind].label} color={kinds[row.kind].color} size="sm" />,
            },
            { key: 'message', header: 'Message', width: proportional(4) },
            ...(me.role === 'cleaner' ? [] : [{ key: 'author' as const, header: 'Auteur', width: proportional(1) }]),
            {
              key: 'created_at',
              header: 'Date',
              width: proportional(1),
              renderCell: (row) => dateLabel(row.created_at),
            },
          ]}
        />
      ) : (
        <Text>{kind ? 'Aucun retour de ce type pour le moment.' : 'Aucun retour pour le moment.'}</Text>
      )}
      {adding && (
        <IdeaEditor
          close={() => setAdding(false)}
          saved={() => {
            setAdding(false)
            setSuccess('Merci, votre retour a bien été envoyé.')
            void result.refresh()
          }}
        />
      )}
    </PageLayout>
  )
}
