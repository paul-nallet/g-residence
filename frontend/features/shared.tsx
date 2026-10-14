import type { FormEvent, ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack, HStack, StackItem } from '@astryxdesign/core/Stack'
import { Token } from '@astryxdesign/core/Token'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Event } from '../../src/domain/agenda.ts'
import type { Role } from '../../src/domain/accounts.ts'
import { today } from '../../src/domain/rules.ts'
import { Feedback, roleLabels } from './status.tsx'

export { Feedback, Loading, roleLabels } from './status.tsx'

export const dateLabel = (date: string) =>
  date
    ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(date),
      )
    : 'Non définie'
export const kindLabels = {
  entry: 'Entrée prévue',
  exit: 'Départ prévu',
  inspection_entry: 'État des lieux d’entrée',
  inspection_exit: 'État des lieux de sortie',
  intervention: 'Intervention technique',
  technical_visit: 'Visite technique',
}
export const eventSubject = (event: Event) =>
  event.kind === 'intervention' || event.kind === 'technical_visit'
    ? (event.title ?? '') + (event.place ? ' · ' + event.place : '')
    : 'Lot ' + event.lotNumber
export const eventHref = (event: Event) =>
  event.kind === 'technical_visit'
    ? '#visits/' + event.visitId
    : event.kind === 'intervention'
      ? '#technical/travaux/' + event.workId
      : '#lots/' + event.lotId
export const statusLabels = {
  planned: 'Prévu',
  done: 'Réalisé',
  cancelled: 'Annulé',
  vacant: 'Libre',
  occupied: 'Occupé',
}
export function StateToken({ state }: { state: string }) {
  return (
    <Token
      label={statusLabels[state as keyof typeof statusLabels] ?? state}
      color={state === 'done' || state === 'occupied' ? 'green' : state === 'cancelled' ? 'gray' : 'blue'}
      size="sm"
    />
  )
}
export const isOverdue = (event: Event) => event.status === 'planned' && event.date < today()
export function EventStateToken({ event }: { event: Event }) {
  return isOverdue(event) ? <Token label="En retard" color="red" size="sm" /> : <StateToken state={event.status} />
}
export function DateField({
  label,
  value,
  onChange,
  optional = false,
  past = false,
  labelHidden = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  optional?: boolean
  past?: boolean
  labelHidden?: boolean
}) {
  return (
    <DateInput
      label={label}
      value={(value || undefined) as ISODateString | undefined}
      onChange={(next) => onChange(next ?? '')}
      isLabelHidden={labelHidden}
      isOptional={optional}
      isRequired={!optional && !labelHidden}
      hasClear={optional}
      max={past ? (today() as ISODateString) : undefined}
      weekStartsOn="mon"
      format="date"
      presentation="native"
    />
  )
}
export function RoleField({ value, onChange }: { value: Role; onChange: (value: Role) => void }) {
  return (
    <Selector
      label="Rôle"
      value={value}
      onChange={(next) => onChange(next as Role)}
      options={Object.entries(roleLabels).map(([key, label]) => ({ value: key, label }))}
    />
  )
}
export function Editor({
  title,
  children,
  submit,
  close,
  busy,
  error,
  label = 'Enregistrer',
  disabled = false,
}: {
  title: string
  children: ReactNode
  submit: () => void
  close: () => void
  busy: boolean
  error: string
  label?: string
  disabled?: boolean
}) {
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
      purpose="form"
      width={560}
      padding={6}
    >
      <VStack
        as="form"
        gap={4}
        isScrollable
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          if (!busy && !disabled) submit()
        }}
      >
        <DialogHeader title={title} />
        <StackItem size="fill" isScrollable>
          <VStack gap={4}>
            {children}
            <Feedback error={error} />
          </VStack>
        </StackItem>
        <HStack gap={2} wrap="wrap" hAlign="end">
          <Button label="Annuler" onClick={close} isDisabled={busy} />
          <Button label={label} variant="primary" type="submit" isLoading={busy} isDisabled={busy || disabled} />
        </HStack>
      </VStack>
    </Dialog>
  )
}
export function EventList({ events, title = 'Événements' }: { events: readonly Event[]; title?: string }) {
  return (
    <List hasDividers header={<Heading level={2}>{title}</Heading>}>
      {events.length ? (
        events.map((event) => (
          <ListItem
            key={event.id}
            label={`${event.time ? event.time + ' · ' : ''}${eventSubject(event)} · ${kindLabels[event.kind]}`}
            href={eventHref(event)}
            description={`${dateLabel(event.date)}${event.duration ? ' · ' + event.duration + ' min' : ''}${event.resident ? ' · ' + event.resident : ''}${event.comment ? ' · ' + event.comment : ''}`}
            endContent={<EventStateToken event={event} />}
          />
        ))
      ) : (
        <ListItem label="Aucun événement sur cette période." />
      )}
    </List>
  )
}

export function PeriodNav({
  label,
  previous,
  current,
  next,
  onPrevious,
  onCurrent,
  onNext,
}: {
  label: string
  previous: string
  current: string
  next: string
  onPrevious: () => void
  onCurrent: () => void
  onNext: () => void
}) {
  return (
    <ButtonGroup label={label}>
      <Button label={previous} icon={<Icon icon={ChevronLeft} />} onClick={onPrevious} />
      <Button label={current} onClick={onCurrent} />
      <Button label={next} endContent={<Icon icon={ChevronRight} />} onClick={onNext} />
    </ButtonGroup>
  )
}
