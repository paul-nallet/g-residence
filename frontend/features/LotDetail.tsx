import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Token } from '@astryxdesign/core/Token'
import type { Me } from '../../src/domain/accounts.ts'
import type { Inspection, Notice, Stay } from '../../src/domain/stays.ts'
import { parisDate, parisTime } from '../../src/domain/rules.ts'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { LotCleaning } from './Cleaning.tsx'
import { OccupationsTable } from './OccupationsTable.tsx'
import { LotEditor } from './Lots.tsx'
import { InspectionEditor, NoticeEditor, StayActionEditor, StayEditor } from './StayEditors.tsx'
import { dateLabel, Editor, EventList, Feedback, Loading, StateToken } from './shared.tsx'

type Edit =
  | { kind: 'lot' }
  | { kind: 'stay'; stay?: Stay }
  | { kind: 'action'; stay: Stay; action: 'entry' | 'exit' | 'cancel' }
  | { kind: 'notice'; stayId: string; notice?: Notice }
  | { kind: 'inspection'; stayId: string; inspection?: Inspection }
  | { kind: 'archive' }
  | { kind: 'withdraw'; notice: Notice }
export function LotDetail({ id, me }: { id: string; me: Me }) {
  const load = useCallback(() => call((client) => client.lots.detail({ params: { id } })), [id]),
    result = useQuery('lot:' + id, load),
    [edit, setEdit] = useState<Edit | null>(null),
    [tab, setTab] = useState('overview'),
    panelPrefix = useId(),
    mutation = useMutation()
  useDetailCrumb(result.data ? 'Lot ' + result.data.lot.number : '')
  if (!result.data)
    return (
      <PageLayout header={<Heading level={1}>Fiche du lot</Heading>}>
        <Loading error={result.error} retry={() => void result.refresh()} />
      </PageLayout>
    )
  const { lot, stays, notices, inspections, history, events } = result.data,
    canEdit = me.role !== 'cleaner'
  const activeTab = canEdit ? tab : 'overview'
  const saved = () => {
    setEdit(null)
    void result.refresh()
  }
  return (
    <PageLayout
      header={
        <VStack gap={3}>
          <HStack gap={3} wrap="wrap" hAlign="between">
            <VStack gap={2}>
              <Heading level={1}>Lot {lot.number}</Heading>
              <Text>
                {lot.building_name + ' · '}
                {lot.floor ? 'Étage ' + lot.floor + ' · ' : ''}
                {lot.type || 'Type non précisé'}
              </Text>
            </VStack>
            <HStack gap={2} wrap="wrap">
              <StateToken state={lot.occupancy === 'planned' ? 'Entrée prévue' : lot.occupancy} />
              {!!lot.archived && <Token label="Archivé" color="gray" />}
              {canEdit && (
                <>
                  <Button label="Modifier le lot" onClick={() => setEdit({ kind: 'lot' })} />
                  <Button
                    label={lot.archived ? 'Restaurer le lot' : 'Archiver le lot'}
                    variant="ghost"
                    onClick={() => setEdit({ kind: 'archive' })}
                  />
                </>
              )}
            </HStack>
          </HStack>
        </VStack>
      }
      navigation={
        <TabList value={activeTab} onChange={setTab} role="tablist" aria-label="Rubriques du lot">
          <Tab
            value="overview"
            label="Vue d’ensemble"
            id={panelPrefix + '-tab-overview'}
            panelId={panelPrefix + '-overview'}
          />
          {canEdit && (
            <>
              <Tab value="stays" label="Occupations" id={panelPrefix + '-tab-stays'} panelId={panelPrefix + '-stays'} />
              <Tab
                value="cleaning"
                label="Ménage"
                id={panelPrefix + '-tab-cleaning'}
                panelId={panelPrefix + '-cleaning'}
              />
              <Tab
                value="history"
                label="Historique"
                id={panelPrefix + '-tab-history'}
                panelId={panelPrefix + '-history'}
              />
            </>
          )}
        </TabList>
      }
    >
      <Feedback error={mutation.error} success={mutation.success} />
      {activeTab === 'overview' && (
        <VStack
          gap={5}
          role="tabpanel"
          id={panelPrefix + '-overview'}
          aria-labelledby={panelPrefix + '-tab-overview'}
          tabIndex={0}
        >
          <EventList events={events} title="Prochains mouvements et rendez-vous · 30 jours" />
        </VStack>
      )}
      {canEdit && activeTab === 'stays' && (
        <VStack
          gap={5}
          role="tabpanel"
          id={panelPrefix + '-stays'}
          aria-labelledby={panelPrefix + '-tab-stays'}
          tabIndex={0}
        >
          <HStack gap={3} wrap="wrap" hAlign="between">
            <Heading level={2}>Occupations</Heading>
            {!lot.archived && (
              <Button label="Prévoir une occupation" variant="primary" onClick={() => setEdit({ kind: 'stay' })} />
            )}
          </HStack>
          {!stays.length && <Text>Aucun séjour enregistré pour ce lot.</Text>}
          {!!stays.length && (
            <OccupationsTable
              stays={stays}
              notices={notices}
              renderDetails={(stay) => {
                const notice = notices.find((item) => item.stay_id === stay.id && !item.withdrawn),
                  appointments = inspections.filter((item) => item.stay_id === stay.id)
                const closed = !!stay.cancelled || !!stay.actual_end
                return (
                  <VStack gap={3} key={stay.id}>
                    <HStack gap={2} wrap="wrap">
                      <Heading level={3}>
                        {stay.first_name} {stay.last_name}
                      </Heading>
                      <StateToken
                        state={
                          stay.cancelled
                            ? 'cancelled'
                            : stay.actual_end
                              ? 'Terminé'
                              : stay.actual_start
                                ? 'occupied'
                                : 'planned'
                        }
                      />
                    </HStack>
                    <Text>
                      Prévu : {dateLabel(stay.planned_start)} → {dateLabel(stay.planned_end ?? '')}
                    </Text>
                    <Text color="secondary">
                      Réel : entrée {dateLabel(stay.actual_start ?? '')} · sortie {dateLabel(stay.actual_end ?? '')}
                    </Text>
                    {!stay.cancelled && (
                      <HStack gap={2} wrap="wrap">
                        {!lot.archived && (
                          <Button label="Corriger le séjour" onClick={() => setEdit({ kind: 'stay', stay })} />
                        )}
                        {!lot.archived && (
                          <Button
                            label={stay.actual_start ? 'Corriger l’entrée réelle' : 'Confirmer l’entrée réelle'}
                            onClick={() => setEdit({ kind: 'action', stay, action: 'entry' })}
                          />
                        )}
                        {stay.actual_start && !lot.archived && (
                          <Button
                            label={stay.actual_end ? 'Corriger la sortie réelle' : 'Confirmer la sortie réelle'}
                            onClick={() => setEdit({ kind: 'action', stay, action: 'exit' })}
                          />
                        )}
                        {!stay.actual_start && !lot.archived && (
                          <Button
                            label="Annuler le séjour"
                            variant="ghost"
                            onClick={() => setEdit({ kind: 'action', stay, action: 'cancel' })}
                          />
                        )}
                        {!closed && !lot.archived && !notice && (
                          <Button
                            label="Enregistrer un préavis"
                            onClick={() => setEdit({ kind: 'notice', stayId: stay.id })}
                          />
                        )}
                        {!lot.archived && (
                          <Button
                            label="Planifier un état des lieux"
                            onClick={() => setEdit({ kind: 'inspection', stayId: stay.id })}
                          />
                        )}
                      </HStack>
                    )}
                    {notice && (
                      <VStack gap={2}>
                        <Text weight="semibold">
                          Préavis reçu le {dateLabel(notice.received_on)} · départ le {dateLabel(notice.departure_on)}
                        </Text>
                        {notice.comment && <Text>{notice.comment}</Text>}
                        {!closed && (
                          <HStack gap={2} wrap="wrap">
                            <Button
                              label="Corriger le préavis"
                              onClick={() => setEdit({ kind: 'notice', stayId: stay.id, notice })}
                            />
                            <Button
                              label="Retirer le préavis"
                              variant="ghost"
                              onClick={() => setEdit({ kind: 'withdraw', notice })}
                            />
                          </HStack>
                        )}
                      </VStack>
                    )}
                    {notices
                      .filter((n) => n.stay_id === stay.id && n.withdrawn)
                      .map((n) => (
                        <Text key={n.id} type="supporting">
                          Préavis retiré · reçu le {dateLabel(n.received_on)}, départ envisagé le{' '}
                          {dateLabel(n.departure_on)}.
                        </Text>
                      ))}
                    {!!appointments.length && (
                      <List hasDividers header={<Heading level={3}>États des lieux</Heading>}>
                        {appointments.map((i) => (
                          <ListItem
                            key={i.id}
                            label={
                              (i.kind === 'entry' ? 'Entrée' : 'Sortie') +
                              ' · ' +
                              dateLabel(parisDate(i.starts_at)) +
                              ' à ' +
                              parisTime(i.starts_at)
                            }
                            description={
                              <VStack gap={2}>
                                <Text>
                                  {i.duration} min ·{' '}
                                  {i.status === 'done'
                                    ? 'Réalisé le ' + dateLabel(i.completed_on ?? '')
                                    : i.status === 'cancelled'
                                      ? 'Annulé'
                                      : 'Prévu'}
                                </Text>
                                {i.comment && <Text>{i.comment}</Text>}
                                {!stay.cancelled && !lot.archived && (
                                  <Button
                                    label="Modifier le rendez-vous"
                                    onClick={() => setEdit({ kind: 'inspection', stayId: stay.id, inspection: i })}
                                  />
                                )}
                              </VStack>
                            }
                            endContent={<StateToken state={i.status} />}
                          />
                        ))}
                      </List>
                    )}
                    <Divider />
                  </VStack>
                )
              }}
            />
          )}
        </VStack>
      )}
      {canEdit && activeTab === 'cleaning' && (
        <VStack
          gap={5}
          role="tabpanel"
          id={panelPrefix + '-cleaning'}
          aria-labelledby={panelPrefix + '-tab-cleaning'}
          tabIndex={0}
        >
          <LotCleaning lotId={id} archived={!!lot.archived} />
        </VStack>
      )}
      {canEdit && activeTab === 'history' && (
        <VStack
          gap={5}
          role="tabpanel"
          id={panelPrefix + '-history'}
          aria-labelledby={panelPrefix + '-tab-history'}
          tabIndex={0}
        >
          <List hasDividers header={<Heading level={2}>Historique des modifications</Heading>}>
            {history.length ? (
              history.map((item) => (
                <ListItem
                  key={item.id}
                  label={item.action}
                  description={`${dateLabel(parisDate(item.created_at))} à ${parisTime(item.created_at)} · ${item.actor}`}
                />
              ))
            ) : (
              <ListItem label="Aucune modification enregistrée." />
            )}
          </List>
        </VStack>
      )}
      {edit?.kind === 'lot' && <LotEditor lot={lot} close={() => setEdit(null)} saved={saved} />}
      {edit?.kind === 'stay' && <StayEditor lotId={id} stay={edit.stay} close={() => setEdit(null)} saved={saved} />}
      {edit?.kind === 'action' && (
        <StayActionEditor stay={edit.stay} action={edit.action} close={() => setEdit(null)} saved={saved} />
      )}
      {edit?.kind === 'notice' && (
        <NoticeEditor stayId={edit.stayId} notice={edit.notice} close={() => setEdit(null)} saved={saved} />
      )}
      {edit?.kind === 'inspection' && (
        <InspectionEditor stayId={edit.stayId} inspection={edit.inspection} close={() => setEdit(null)} saved={saved} />
      )}
      {edit?.kind === 'archive' && (
        <Editor
          title={lot.archived ? 'Restaurer le lot' : 'Archiver le lot'}
          close={() => setEdit(null)}
          busy={mutation.busy}
          error={mutation.error}
          submit={() =>
            void mutation.run(
              () => call((client) => client.lots.archive({ params: { id }, payload: { archived: !lot.archived } })),
              saved,
            )
          }
          label={lot.archived ? 'Restaurer' : 'Archiver'}
        >
          <Text>L’historique sera conservé. Un lot avec un séjour en cours ou prévu ne peut pas être archivé.</Text>
        </Editor>
      )}
      {edit?.kind === 'withdraw' && (
        <Editor
          title="Retirer le préavis"
          close={() => setEdit(null)}
          busy={mutation.busy}
          error={mutation.error}
          submit={() =>
            void mutation.run(
              () => call((client) => client.notices.withdraw({ params: { id: edit.notice.id } })),
              saved,
            )
          }
          label="Retirer le préavis"
        >
          <Text>
            Le départ prévu avant ce préavis sera rétabli, si cela ne crée pas de conflit avec un autre séjour. Le
            retrait restera dans l’historique.
          </Text>
        </Editor>
      )}
    </PageLayout>
  )
}
