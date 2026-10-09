import { Context, Effect, Layer } from 'effect'
import {
  EmailTaken,
  InvalidCredentials,
  INVITATION_DAYS,
  InvitationUnavailable,
  LastAdmin,
  LOGIN_WINDOW,
  MAX_EMAIL_ATTEMPTS,
  MAX_IP_ATTEMPTS,
  type Me,
  MemberNotFound,
  type Role,
  SelfDemotion,
  SESSION_DAYS,
  SetupLocked,
  TooManyAttempts,
} from '../domain/accounts.ts'
import { later, now } from '../domain/clock.ts'
import { admin } from '../domain/CurrentUser.ts'
import { onViolation, sql, Sql } from './Database.ts'

const DAY = 86400000
const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('')
const hashToken = (token: string) =>
  Effect.promise(async () => hex(await crypto.subtle.digest('SHA-256', encoder.encode(token))))
const passwordHash = (password: string, salt: string) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    return hex(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 },
        key,
        256,
      ),
    )
  })
const equalHash = (a: string, b: string) => {
  let diff = a.length ^ b.length
  for (let index = 0; index < Math.max(a.length, b.length); index++)
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
  return diff === 0
}
const newToken = () => crypto.randomUUID() + crypto.randomUUID()
type UserRow = {
  id: string
  residence_id: string
  email: string
  name: string
  role: Role
  password_hash: string
  salt: string
}
type InviteRow = { id: string; residence_id: string; email: string; role: Role; expires_at: string }

const sessionStatement = Effect.fn('Accounts.sessionStatement')(function* (userId: string, token: string) {
  return sql(
    'INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)',
    yield* hashToken(token),
    userId,
    yield* later(SESSION_DAYS * DAY),
  )
})

const make = (adminEmail: string) =>
  Effect.gen(function* () {
    const db = yield* Sql

    const getMe = (id: string) =>
      db.first<Me>(
        sql(
          'SELECT u.id,u.name,u.email,u.role,u.residence_id AS residenceId,r.name AS residenceName FROM users u JOIN residences r ON r.id=u.residence_id WHERE u.id=? AND u.disabled=0',
          id,
        ),
      )
    const signedIn = Effect.fn('Accounts.signedIn')(function* (userId: string, token: string) {
      return { token, me: (yield* getMe(userId))! }
    })
    const invitation = Effect.fn('Accounts.invitation')(function* (token: string) {
      const row = yield* db.first<InviteRow & { residenceName: string }>(
        sql(
          'SELECT i.id,i.residence_id,i.email,i.role,i.expires_at,r.name AS residenceName FROM invitations i JOIN residences r ON r.id=i.residence_id WHERE i.hash=? AND i.used_at IS NULL AND i.expires_at>?',
          yield* hashToken(token),
          yield* now,
        ),
      )
      if (!row) return yield* new InvitationUnavailable()
      return row
    })

    const session = Effect.fn('Accounts.session')(function* (token: string) {
      if (!token) return null
      const row = yield* db.first<{ user_id: string }>(
        sql('SELECT user_id FROM sessions WHERE hash=? AND expires_at>?', yield* hashToken(token), yield* now),
      )
      return row ? yield* getMe(row.user_id) : null
    })

    const status = Effect.fn('Accounts.status')(function* (local: boolean) {
      const row = yield* db.first<{ count: number }>(sql('SELECT COUNT(*) AS count FROM residences'))
      return { setupRequired: !row?.count, setupAllowed: local || !!adminEmail }
    })

    const setup = Effect.fn('Accounts.setup')(function* (
      input: { name: string; residenceName: string; email: string; password: string },
      local: boolean,
    ) {
      const email = input.email.toLowerCase()
      if (!local && (!adminEmail || email !== adminEmail.trim().toLowerCase())) return yield* new SetupLocked()
      const uid = crypto.randomUUID(),
        rid = crypto.randomUUID(),
        salt = crypto.randomUUID(),
        token = newToken()
      yield* db.batch([
        sql('INSERT INTO residences(id,name) VALUES(?,?)', rid, input.residenceName),
        sql(
          'INSERT INTO users(id,residence_id,email,name,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?,?)',
          uid,
          rid,
          email,
          input.name,
          'admin',
          yield* passwordHash(input.password, salt),
          salt,
          yield* now,
        ),
        yield* sessionStatement(uid, token),
      ])
      return yield* signedIn(uid, token)
    })

    const login = Effect.fn('Accounts.login')(function* (emailValue: string, password: string, ip: string) {
      const email = emailValue.toLowerCase(),
        current = yield* now,
        until = yield* later(LOGIN_WINDOW)
      const keys = [yield* hashToken('email:' + email), yield* hashToken('ip:' + ip)] as const
      yield* db.batch(
        keys.map((key) =>
          sql(
            'INSERT INTO login_attempts(key,attempts,until_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN until_at<=? THEN 1 ELSE attempts+1 END,until_at=CASE WHEN until_at<=? THEN excluded.until_at ELSE until_at END',
            key,
            until,
            current,
            current,
          ),
        ),
      )
      const [byEmail, byIp] = yield* Effect.all(
        keys.map((key) => db.first<{ attempts: number }>(sql('SELECT attempts FROM login_attempts WHERE key=?', key))),
      )
      if ((byEmail?.attempts ?? 0) > MAX_EMAIL_ATTEMPTS || (byIp?.attempts ?? 0) > MAX_IP_ATTEMPTS)
        return yield* new TooManyAttempts()
      const user = yield* db.first<UserRow>(sql('SELECT * FROM users WHERE email=? AND disabled=0', email))
      const digest = yield* passwordHash(password.length > 200 ? 'invalid' : password, user?.salt ?? 'absent')
      if (!user || !equalHash(digest, user.password_hash)) return yield* new InvalidCredentials()
      const token = newToken()
      yield* db.batch([
        sql('DELETE FROM login_attempts WHERE key=?', keys[0]),
        yield* sessionStatement(user.id, token),
        sql('DELETE FROM sessions WHERE expires_at<=?', current),
      ])
      return yield* signedIn(user.id, token)
    })

    const logout = Effect.fn('Accounts.logout')(function* (token: string) {
      yield* db.batch([sql('DELETE FROM sessions WHERE hash=?', yield* hashToken(token))])
      return { ok: true }
    })

    const team = Effect.fn('Accounts.team')(function* () {
      const me = yield* admin
      const [members, invitations] = yield* Effect.all([
        db.all<{ id: string; name: string; email: string; role: Role; disabled: number }>(
          sql('SELECT id,name,email,role,disabled FROM users WHERE residence_id=? ORDER BY name', me.residenceId),
        ),
        db.all<{ id: string; email: string; role: Role; expires_at: string }>(
          sql(
            'SELECT id,email,role,expires_at FROM invitations WHERE residence_id=? AND used_at IS NULL AND expires_at>? ORDER BY email',
            me.residenceId,
            yield* now,
          ),
        ),
      ])
      return { members, invitations }
    })

    const invite = Effect.fn('Accounts.invite')(function* (input: { email: string; role: Role }) {
      const me = yield* admin
      const email = input.email.toLowerCase()
      if (yield* db.first(sql('SELECT id FROM users WHERE email=?', email))) return yield* new EmailTaken()
      const token = newToken(),
        current = yield* now
      yield* db.batch([
        sql(
          'UPDATE invitations SET used_at=? WHERE email=? AND expires_at<=? AND used_at IS NULL',
          current,
          email,
          current,
        ),
        sql(
          'INSERT INTO invitations(id,residence_id,email,role,hash,expires_at) VALUES(?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          email,
          input.role,
          yield* hashToken(token),
          yield* later(INVITATION_DAYS * DAY),
        ),
      ])
      return { token }
    })

    const preview = Effect.fn('Accounts.preview')(function* (token: string) {
      const row = yield* invitation(token)
      return { email: row.email, role: row.role, residenceName: row.residenceName }
    })

    const accept = Effect.fn('Accounts.accept')(function* (token: string, input: { name: string; password: string }) {
      const row = yield* invitation(token),
        uid = crypto.randomUUID(),
        salt = crypto.randomUUID(),
        sessionToken = newToken(),
        current = yield* now
      yield* db.batch([
        sql(
          'INSERT INTO users(id,residence_id,email,name,role,password_hash,salt,created_at) SELECT ?,residence_id,email,?,role,?,?,? FROM invitations WHERE id=? AND used_at IS NULL AND expires_at>?',
          uid,
          input.name,
          yield* passwordHash(input.password, salt),
          salt,
          current,
          row.id,
          current,
        ),
        sql('UPDATE invitations SET used_at=? WHERE id=? AND used_at IS NULL', current, row.id),
        yield* sessionStatement(uid, sessionToken),
      ])
      return yield* signedIn(uid, sessionToken)
    })

    const revoke = Effect.fn('Accounts.revoke')(function* (id: string) {
      const me = yield* admin
      yield* db.batch([
        sql('UPDATE invitations SET used_at=? WHERE id=? AND residence_id=?', yield* now, id, me.residenceId),
      ])
      return { ok: true }
    })

    const member = Effect.fn('Accounts.member')(function* (id: string, input: { role: Role; disabled: boolean }) {
      const me = yield* admin
      if (id === me.id && (input.disabled || input.role !== 'admin')) return yield* new SelfDemotion()
      if (!(yield* db.first(sql('SELECT id FROM users WHERE id=? AND residence_id=?', id, me.residenceId))))
        return yield* new MemberNotFound()
      yield* db
        .batch([
          sql(
            'UPDATE users SET role=?,disabled=? WHERE id=? AND residence_id=?',
            input.role,
            Number(input.disabled),
            id,
            me.residenceId,
          ),
          sql('DELETE FROM sessions WHERE user_id=?', id),
        ])
        .pipe(onViolation('last_admin', () => new LastAdmin()))
      return { ok: true }
    })

    return { session, status, setup, login, logout, team, invite, preview, accept, revoke, member }
  })

export class Accounts extends Context.Service<Accounts, Effect.Success<ReturnType<typeof make>>>()(
  'gresidence/Accounts',
) {
  static readonly layer = (adminEmail: string) => Layer.effect(Accounts, make(adminEmail))
}
