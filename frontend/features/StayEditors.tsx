import { useState } from 'react'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Text } from '@astryxdesign/core/Text'
import type { Inspection, Notice, Stay } from '../../src/domain/stays.ts'
import { parisDate, parisTime, today } from '../../src/domain/rules.ts'
import { call } from '../lib/api.ts'
import { useMutation } from '../lib/data.ts'
import { DateField, Editor } from './shared.tsx'

export function StayEditor({
  lotId,
  stay,
  close,
  saved,
}: {
  lotId: string
  stay?: Stay
  close: () => void
  saved: () => void
}) {
  const [first, setFirst] = useState(stay?.first_name ?? ''),
    [last, setLast] = useState(stay?.last_name ?? ''),
    [start, setStart] = useState(stay?.planned_start ?? today()),
    [end, setEnd] = useState(stay?.planned_end ?? '')
  const mutation = useMutation()
  const submit = () =>
    mutation.run(() => {
      const payload = { first_name: first, last_name: last, planned_start: start, planned_end: end || null }
      return stay
        ? call((client) => client.stays.update({ params: { id: stay.id }, payload }))
        : call((client) => client.stays.create({ params: { id: lotId }, payload }))
    }, saved)
  return (
    <Editor
      title={stay ? 'Corriger le séjour' : 'Prévoir une occupation'}
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
    >
      <TextInput label="Prénom du résident" value={first} onChange={setFirst} isRequired />
      <TextInput label="Nom du résident" value={last} onChange={setLast} isRequired />
      <DateField label="Entrée prévue" value={start} onChange={setStart} />
      <DateField label="Départ prévu" value={end} onChange={setEnd} optional />
      <Text color="secondary">
        L’entrée et la sortie réelles seront confirmées séparément. Un préavis actif porte la date de départ prévue.
      </Text>
    </Editor>
  )
}
export function StayActionEditor({
  stay,
  action,
  close,
  saved,
}: {
  stay: Stay
  action: 'entry' | 'exit' | 'cancel'
  close: () => void
  saved: () => void
}) {
  const [date, setDate] = useState((action === 'entry' ? stay.actual_start : stay.actual_end) ?? today()),
    mutation = useMutation()
  const submit = () =>
    mutation.run(
      () => call((client) => client.stays.action({ params: { id: stay.id }, payload: { action, date } })),
      saved,
    )
  return (
    <Editor
      title={
        action === 'entry'
          ? 'Confirmer ou corriger l’entrée réelle'
          : action === 'exit'
            ? 'Confirmer ou corriger la sortie réelle'
            : 'Annuler ce séjour'
      }
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
      label={action === 'cancel' ? 'Annuler le séjour' : 'Confirmer'}
    >
      <Text>
        {stay.first_name} {stay.last_name}
      </Text>
      {action === 'cancel' ? (
        <Text>Les rendez-vous seront annulés et le préavis retiré. Le séjour restera dans l’historique.</Text>
      ) : (
        <DateField label="Date réelle" value={date} onChange={setDate} past />
      )}
    </Editor>
  )
}
export function NoticeEditor({
  stayId,
  notice,
  close,
  saved,
}: {
  stayId: string
  notice?: Notice
  close: () => void
  saved: () => void
}) {
  const [received, setReceived] = useState(notice?.received_on ?? today()),
    [departure, setDeparture] = useState(notice?.departure_on ?? ''),
    [comment, setComment] = useState(notice?.comment ?? ''),
    mutation = useMutation()
  const submit = () =>
    mutation.run(() => {
      const payload = { received_on: received, departure_on: departure, comment }
      return notice
        ? call((client) => client.notices.update({ params: { id: notice.id }, payload }))
        : call((client) => client.notices.create({ params: { id: stayId }, payload }))
    }, saved)
  return (
    <Editor
      title={notice ? 'Corriger le préavis' : 'Enregistrer un préavis'}
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
    >
      <DateField label="Réception du préavis" value={received} onChange={setReceived} past />
      <DateField label="Départ prévu" value={departure} onChange={setDeparture} />
      <TextArea label="Commentaire" value={comment} onChange={setComment} isOptional maxLength={2000} />
      <Text color="secondary">
        Cette date remplace le départ prévu du séjour. Aucun délai n’est calculé automatiquement.
      </Text>
    </Editor>
  )
}
export function InspectionEditor({
  stayId,
  inspection,
  close,
  saved,
}: {
  stayId: string
  inspection?: Inspection
  close: () => void
  saved: () => void
}) {
  const [kind, setKind] = useState<'entry' | 'exit'>(inspection?.kind ?? 'entry'),
    [localStart, setLocalStart] = useState(
      inspection ? `${parisDate(inspection.starts_at)}T${parisTime(inspection.starts_at)}` : today() + 'T10:00',
    ),
    [duration, setDuration] = useState(inspection?.duration ?? 30),
    [status, setStatus] = useState<'planned' | 'done' | 'cancelled'>(inspection?.status ?? 'planned'),
    [completed, setCompleted] = useState(inspection?.completed_on ?? today()),
    [comment, setComment] = useState(inspection?.comment ?? ''),
    mutation = useMutation()
  const submit = () =>
    mutation.run(() => {
      const payload = {
        kind,
        local_start: localStart,
        duration,
        status,
        completed_on: status === 'done' ? completed : null,
        comment,
      }
      return inspection
        ? call((client) => client.inspections.update({ params: { id: inspection.id }, payload }))
        : call((client) => client.inspections.create({ params: { id: stayId }, payload }))
    }, saved)
  return (
    <Editor
      title={inspection ? 'Modifier l’état des lieux' : 'Planifier un état des lieux'}
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
    >
      <Selector
        label="Type"
        value={kind}
        onChange={(value) => setKind(value as 'entry' | 'exit')}
        options={[
          { value: 'entry', label: 'Entrée' },
          { value: 'exit', label: 'Sortie' },
        ]}
      />
      <DateTimeInput
        label="Rendez-vous · heure de Paris"
        timeLabel="Heure du rendez-vous"
        value={localStart as ISODateTimeString}
        onChange={(value) => setLocalStart(value ?? '')}
        hourFormat="24h"
        presentation="native"
      />
      <NumberInput
        label="Durée"
        value={duration}
        onChange={setDuration}
        min={5}
        max={480}
        units="min"
        isIntegerOnly
        isWheelEnabled={false}
      />
      <Selector
        label="État du rendez-vous"
        value={status}
        onChange={(value) => setStatus(value as 'planned' | 'done' | 'cancelled')}
        options={[
          { value: 'planned', label: 'Prévu' },
          { value: 'done', label: 'Réalisé' },
          { value: 'cancelled', label: 'Annulé' },
        ]}
      />
      {status === 'done' && <DateField label="Date de réalisation" value={completed} onChange={setCompleted} past />}
      <TextArea label="Commentaire" value={comment} onChange={setComment} isOptional maxLength={2000} />
      <Text color="secondary">
        La réalisation du rendez-vous ne confirme pas automatiquement le mouvement du résident.
      </Text>
    </Editor>
  )
}
