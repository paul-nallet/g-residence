import { Schema } from 'effect'

export const Priority = Schema.Literals(['low', 'normal', 'high', 'urgent']).annotate({
  message: 'Priorité invalide.',
})
export type Priority = typeof Priority.Type
export const priorityLabels: Record<Priority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
}
