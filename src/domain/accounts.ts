import { Schema } from 'effect'
import { Email, RequiredText } from './shared.ts'

const passwordMessage = 'Le mot de passe doit contenir entre 12 et 200 caractères.'
export const NewPassword = Schema.String.check(
  Schema.isMinLength(12, { message: passwordMessage }),
  Schema.isMaxLength(200, { message: passwordMessage }),
)
export const Role = Schema.Literals(['admin', 'manager', 'cleaner'])
export type Role = typeof Role.Type
export const Me = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Role,
  residenceId: Schema.String,
  residenceName: Schema.String,
})
export type Me = typeof Me.Type
export const Status = Schema.Struct({
  setupRequired: Schema.Boolean,
  setupAllowed: Schema.Boolean,
  me: Schema.NullOr(Me),
})
export const SetupInput = Schema.Struct({
  name: RequiredText('Nom'),
  residenceName: RequiredText('Résidence'),
  email: Email,
  password: NewPassword,
})
export const LoginInput = Schema.Struct({ email: Email, password: Schema.String })
export const InviteInput = Schema.Struct({ email: Email, role: Role })
export const AcceptInput = Schema.Struct({ name: RequiredText('Nom'), password: NewPassword })
export const MemberInput = Schema.Struct({ role: Role, disabled: Schema.Boolean })
export const InvitePreview = Schema.Struct({ email: Schema.String, role: Role, residenceName: Schema.String })
export const Member = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Role,
  disabled: Schema.Number,
})
export const Invitation = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: Role,
  expires_at: Schema.String,
})
export const Team = Schema.Struct({ members: Schema.Array(Member), invitations: Schema.Array(Invitation) })

export class SetupLocked extends Schema.TaggedError<SetupLocked>()('SetupLocked', {}) {}
export class TooManyAttempts extends Schema.TaggedError<TooManyAttempts>()('TooManyAttempts', {}) {}
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()('InvalidCredentials', {}) {}
export class InvitationUnavailable extends Schema.TaggedError<InvitationUnavailable>()('InvitationUnavailable', {}) {}
export class EmailTaken extends Schema.TaggedError<EmailTaken>()('EmailTaken', {}) {}
export class SelfDemotion extends Schema.TaggedError<SelfDemotion>()('SelfDemotion', {}) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()('MemberNotFound', {}) {}
export class LastAdmin extends Schema.TaggedError<LastAdmin>()('LastAdmin', {}) {}

export type AccountsError =
  | SetupLocked
  | TooManyAttempts
  | InvalidCredentials
  | InvitationUnavailable
  | EmailTaken
  | SelfDemotion
  | MemberNotFound
  | LastAdmin

export const SESSION_DAYS = 30
export const INVITATION_DAYS = 7
export const LOGIN_WINDOW = 15 * 60 * 1000
export const MAX_EMAIL_ATTEMPTS = 5
export const MAX_IP_ATTEMPTS = 30
