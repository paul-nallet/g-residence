import { Schema, SchemaGetter } from 'effect'
import { isCivilDate, isLocalDateTime } from './rules.ts'

const trimmedTo = (from: Schema.String, to: Schema.String) =>
  from.pipe(Schema.decodeTo(to, { decode: SchemaGetter.trim(), encode: SchemaGetter.passthrough() }))
export const RequiredText = (label: string, max = 160) => {
  const message = `${label} : valeur obligatoire, ${max} caractères maximum.`
  return trimmedTo(
    Schema.String,
    Schema.String.check(Schema.isMinLength(1, { message }), Schema.isMaxLength(max, { message })),
  )
}
export const OptionalText = (max = 2000) =>
  trimmedTo(
    Schema.String.check(Schema.isMaxLength(max, { message: `Texte trop long (${max} caractères maximum).` })),
    Schema.String,
  )
export const CivilDate = Schema.String.check(Schema.makeFilter(isCivilDate, { message: 'Date invalide.' }))
export const LocalDateTime = Schema.String.check(Schema.makeFilter(isLocalDateTime, { message: 'Horaire invalide.' }))
export const Instant = Schema.String.check(
  Schema.makeFilter(
    (value: string) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value)),
    {
      message: 'Horodatage invalide.',
    },
  ),
)
export const ClientId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, {
    message: 'Identifiant invalide.',
  }),
)
export const CivilMonth = Schema.String.check(
  Schema.makeFilter((value: string) => /^\d{4}-\d{2}$/.test(value) && isCivilDate(value + '-01'), {
    message: 'Date invalide.',
  }),
)
const emailMessage = 'Email : valeur obligatoire, 254 caractères maximum.'
export const Email = trimmedTo(
  Schema.String,
  Schema.String.check(
    Schema.isMinLength(1, { message: emailMessage }),
    Schema.isMaxLength(254, { message: emailMessage }),
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Email invalide.' }),
  ),
)
export const IntegerBetween = (minimum: number, maximum: number, message: string) =>
  Schema.Number.check(
    Schema.isInt({ message }),
    Schema.isGreaterThanOrEqualTo(minimum, { message }),
    Schema.isLessThanOrEqualTo(maximum, { message }),
  )
export const PageNumber = (max: number) =>
  Schema.NumberFromString.check(
    Schema.isInt({ message: 'Page invalide.' }),
    Schema.isGreaterThanOrEqualTo(1, { message: 'Page invalide.' }),
    Schema.isLessThanOrEqualTo(max, { message: 'Page invalide.' }),
  )

export const Health = Schema.Struct({
  application: Schema.Literal('gresidence'),
  status: Schema.Literal('ready'),
  stage: Schema.Literal('v1'),
})
export const Ok = Schema.Struct({ ok: Schema.Boolean })
