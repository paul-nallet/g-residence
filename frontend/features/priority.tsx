import { Selector } from '@astryxdesign/core/Selector'
import { Token } from '@astryxdesign/core/Token'
import { Priority, priorityLabels } from '../../src/domain/priority.ts'

const priorityColors = { low: 'gray', normal: 'default', high: 'orange', urgent: 'red' } as const
const options = Priority.literals.map((value) => ({ value, label: priorityLabels[value] }))
export type PriorityFilterValue = Priority | 'all'

export function PriorityToken({ priority }: { priority: Priority }) {
  return (
    <Token
      label={priorityLabels[priority]}
      description={'Priorité ' + priorityLabels[priority].toLowerCase()}
      color={priorityColors[priority]}
      size="sm"
    />
  )
}

export function PriorityField({ value, onChange }: { value: Priority; onChange: (value: Priority) => void }) {
  return (
    <Selector
      label="Priorité"
      value={value}
      onChange={(next) => onChange(Priority.literals.find((item) => item === next) ?? 'normal')}
      options={options}
      presentation="adaptive"
    />
  )
}

export function PriorityFilter({
  value,
  onChange,
  isLabelHidden = false,
}: {
  value: PriorityFilterValue
  onChange: (value: PriorityFilterValue) => void
  isLabelHidden?: boolean
}) {
  return (
    <Selector
      label="Priorité"
      value={value}
      onChange={(next) => onChange(Priority.literals.find((item) => item === next) ?? 'all')}
      isLabelHidden={isLabelHidden}
      options={[{ value: 'all', label: 'Toutes les priorités' }, ...options]}
      presentation="adaptive"
    />
  )
}
