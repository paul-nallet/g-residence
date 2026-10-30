import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import {
  type CleaningReadiness,
  type CleaningTask,
  CleaningType,
  isReady,
  type ReadinessLot,
} from '../../src/domain/cleaning.ts'
import { Cleanliness } from '../../src/domain/lots.ts'
import { call } from '../lib/api.ts'
import { dismissFailure, type Outbox } from '../lib/cleaningOffline.ts'
import { useMutation } from '../lib/data.ts'
import { dateLabel, Feedback } from './shared.tsx'

export const cleaningTypeLabels: Record<CleaningType, string> = {
  departure: 'Départ',
  routine: 'Courant',
  deep: 'Remise en état',
  arrival: 'Avant entrée',
  commons: 'Parties communes',
}
export const cleaningTypeOptions = CleaningType.literals.map((value) => ({ value, label: cleaningTypeLabels[value] }))
export const cleanlinessLabels: Record<Cleanliness, string> = {
  dirty: 'Sale',
  clean: 'Propre',
  inspected: 'Contrôlé',
  out_of_service: 'Hors service',
}
const cleanlinessColors = { dirty: 'yellow', clean: 'cyan', inspected: 'teal', out_of_service: 'gray' } as const
export const hasCleanliness = (lot: { occupancy: string; cleanliness: Cleanliness }) =>
  lot.occupancy !== 'occupied' || lot.cleanliness === 'out_of_service'

export function CleanlinessToken({ cleanliness }: { cleanliness: Cleanliness }) {
  return (
    <Token
      label={cleanlinessLabels[cleanliness]}
      description={'État de propreté : ' + cleanlinessLabels[cleanliness].toLowerCase()}
      color={cleanlinessColors[cleanliness]}
      size="sm"
    />
  )
}

export function CleaningTypeToken({ type }: { type: CleaningType }) {
  return type === 'routine' ? null : (
    <Token label={cleaningTypeLabels[type]} color={type === 'departure' ? 'purple' : 'default'} size="sm" />
  )
}

export function ArrivalToken({ task }: { task: Pick<CleaningTask, 'arrival' | 'status'> }) {
  return task.arrival && task.status === 'planned' ? <Token label="Arrivée ce jour" color="red" size="sm" /> : null
}

export const taskTarget = (task: Pick<CleaningTask, 'lot_id' | 'lot_number' | 'place_name' | 'building_name'>) =>
  (task.lot_id ? 'Lot ' + task.lot_number : task.place_name) + (task.building_name ? ' · ' + task.building_name : '')

const plural = (count: number, one: string, many: string) => count + ' ' + (count > 1 ? many : one)
const lotName = (lot: ReadinessLot) => 'Lot ' + lot.number + (lot.building_name ? ' · ' + lot.building_name : '')

function ReadinessItem({ lot, plan }: { lot: ReadinessLot; plan?: (lotIds: readonly string[]) => void }) {
  const task = lot.task
  const planned = task?.status === 'planned'
  return (
    <ListItem
      label={lotName(lot)}
      href={task && (planned || !isReady(lot)) ? '#cleaning/' + task.id : '#lots/' + lot.lot_id}
      description={[
        lot.arrival ? 'Arrivée le ' + dateLabel(lot.arrival) : 'Aucune arrivée prévue',
        planned ? 'Ménage prévu le ' + dateLabel(task.day) + ' · ' + task.agent_name : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      endContent={
        <HStack gap={2} vAlign="center">
          <CleanlinessToken cleanliness={lot.cleanliness} />
          {!planned && !isReady(lot) && plan && (
            <Button
              size="sm"
              label="Planifier"
              aria-label={'Planifier ' + lotName(lot)}
              onClick={() => plan([lot.lot_id])}
            />
          )}
        </HStack>
      }
    />
  )
}

export const readinessCount = (readiness: CleaningReadiness) =>
  new Set(
    [...readiness.arrivals.filter((lot) => !isReady(lot)), ...readiness.to_prepare]
      .filter((lot) => lot.task?.status !== 'planned')
      .map((lot) => lot.lot_id),
  ).size

export function ReadinessPanel({
  readiness,
  plan,
}: {
  readiness: CleaningReadiness
  plan?: (lotIds: readonly string[]) => void
}) {
  const unplanned = readiness.to_prepare.filter((lot) => lot.task?.status !== 'planned')
  const notReady = readiness.arrivals.filter((lot) => !isReady(lot)).length
  const { counts } = readiness
  return (
    <VStack gap={4}>
      <Text color="secondary">
        {[
          plural(counts.dirty, 'lot sale', 'lots sales'),
          plural(counts.clean, 'propre', 'propres'),
          plural(counts.inspected, 'contrôlé', 'contrôlés'),
          counts.out_of_service ? counts.out_of_service + ' hors service' : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <List
        hasDividers
        header={
          <HStack gap={2} vAlign="center">
            <Heading level={3}>Entrées du jour et du lendemain</Heading>
            {notReady > 0 && <Badge variant="error" label={notReady + ' non prêt' + (notReady > 1 ? 's' : '')} />}
          </HStack>
        }
      >
        {readiness.arrivals.map((lot) => (
          <ReadinessItem key={lot.lot_id + lot.arrival} lot={lot} plan={plan} />
        ))}
        {!readiness.arrivals.length && <ListItem label="Aucune entrée prévue." />}
      </List>
      <List
        hasDividers
        header={
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={2} vAlign="center">
              <Heading level={3}>Lots libres à préparer</Heading>
              {unplanned.length > 0 && <Badge variant="warning" label={unplanned.length} />}
            </HStack>
            {plan && unplanned.length > 1 && (
              <Button
                size="sm"
                label={'Planifier les ' + unplanned.length + ' lots'}
                onClick={() => plan(unplanned.map((lot) => lot.lot_id))}
              />
            )}
          </HStack>
        }
      >
        {readiness.to_prepare.map((lot) => (
          <ReadinessItem key={lot.lot_id} lot={lot} plan={plan} />
        ))}
        {!readiness.to_prepare.length && <ListItem label="Tous les lots libres sont propres." />}
      </List>
    </VStack>
  )
}

export function CleanlinessSelect({
  lotId,
  cleanliness,
  saved,
}: {
  lotId: string
  cleanliness: Cleanliness
  saved: () => void
}) {
  const mutation = useMutation()
  return (
    <VStack gap={1}>
      <Selector
        label="Propreté"
        isLabelHidden
        value={cleanliness}
        isDisabled={mutation.busy}
        presentation="adaptive"
        options={Cleanliness.literals.map((value) => ({ value, label: cleanlinessLabels[value] }))}
        onChange={(value) => {
          const next = Cleanliness.literals.find((state) => state === value)
          if (next && next !== cleanliness)
            void mutation.run(
              () =>
                call((client) =>
                  client.cleaning.cleanliness({ params: { id: lotId }, payload: { cleanliness: next } }),
                ),
              saved,
            )
        }}
      />
      <Feedback error={mutation.error} />
    </VStack>
  )
}

const timeOf = (instant: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(
    new Date(instant),
  )

export function OfflineStatus({ userId, outbox, savedAt }: { userId: string; outbox: Outbox; savedAt: string | null }) {
  const waiting = outbox.ops.length
  return (
    <>
      {savedAt ? (
        <Banner
          status="warning"
          title="Hors ligne"
          description={
            'Données enregistrées sur cet appareil à ' +
            timeOf(savedAt) +
            '. Vous pouvez continuer : ' +
            (waiting
              ? plural(waiting, 'action sera envoyée', 'actions seront envoyées')
              : 'vos actions seront envoyées') +
            ' au retour du réseau.'
          }
        />
      ) : (
        waiting > 0 && (
          <Banner
            status="info"
            title={outbox.flushing ? 'Envoi en cours' : 'En attente de réseau'}
            description={plural(
              waiting,
              'action enregistrée sur cet appareil',
              'actions enregistrées sur cet appareil',
            )}
          />
        )
      )}
      {outbox.failed.map((failure) => (
        <Banner
          key={failure.op.id}
          status="error"
          title="Action refusée au retour du réseau"
          description={failure.message}
          endContent={<Button size="sm" label="Ignorer" onClick={() => dismissFailure(userId, failure.op.id)} />}
        />
      ))}
    </>
  )
}
