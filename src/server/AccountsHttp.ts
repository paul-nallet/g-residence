import { Duration, Effect, Layer, Redacted } from 'effect'
import { HttpServerRequest } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import {
  Api,
  Authorization,
  CurrentUser,
  Forbidden,
  Management,
  SameOrigin,
  Session,
  Unauthorized,
} from '../api/Api.ts'
import { type AccountsError, type Me, SESSION_DAYS } from '../domain/accounts.ts'
import { manager } from '../domain/CurrentUser.ts'
import { Accounts } from '../services/Accounts.ts'
import {
  conflict,
  forbidden,
  httpErrors,
  managementOnly,
  notFound,
  sqlFailure,
  tooManyRequests,
  unauthorized,
} from './errors.ts'

export const SESSION_COOKIE = Session.key

const toHttp = httpErrors<AccountsError>({
  SetupLocked: forbidden('Installation verrouillée pour cet email.'),
  TooManyAttempts: tooManyRequests('Trop de tentatives. Réessayez dans 15 minutes.'),
  InvalidCredentials: unauthorized('Email ou mot de passe incorrect.'),
  InvitationUnavailable: notFound('Invitation absente, expirée ou déjà utilisée.'),
  EmailTaken: conflict('Un compte utilise déjà cet email.'),
  SelfDemotion: forbidden('Vous ne pouvez pas retirer votre propre accès administrateur.'),
  MemberNotFound: notFound('Compte introuvable.'),
  LastAdmin: conflict('Conservez au moins un administrateur actif.'),
})

const sourceRequest = Effect.map(HttpServerRequest.HttpServerRequest, (request) => request.source as Request)
const sessionToken = Effect.map(HttpApiBuilder.securityDecode(Session), Redacted.value)
const isLocal = (request: Request) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
const crossOrigin = (request: Request) =>
  !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
  ((request.headers.get('origin') !== null && request.headers.get('origin') !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site')
const setSession = (token: string, maxAge: Duration.Input) =>
  Effect.flatMap(sourceRequest, (request) =>
    HttpApiBuilder.securitySetCookie(Session, token, {
      path: '/',
      sameSite: 'lax',
      maxAge,
      secure: new URL(request.url).protocol === 'https:',
    }),
  )
const withSession = (session: { token: string; me: Me }) =>
  Effect.as(setSession(session.token, Duration.days(SESSION_DAYS)), session.me)
const refuseCrossOrigin = Effect.gen(function* () {
  if (crossOrigin(yield* sourceRequest)) return yield* new Forbidden({ error: 'Origine refusée.' })
})

export const SameOriginLive = Layer.succeed(
  SameOrigin,
  SameOrigin.of((httpEffect) => Effect.andThen(refuseCrossOrigin, httpEffect)),
)

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const accounts = yield* Accounts
    return Authorization.of({
      session: Effect.fn(function* (httpEffect, { credential }) {
        yield* refuseCrossOrigin
        const me = yield* accounts.session(Redacted.value(credential)).pipe(Effect.catchTag('SqlError', sqlFailure))
        if (!me) return yield* new Unauthorized({ error: 'Session absente ou expirée. Connectez-vous.' })
        return yield* Effect.provideService(httpEffect, CurrentUser, me)
      }),
    })
  }),
)

export const ManagementLive = Layer.succeed(
  Management,
  Management.of((httpEffect) =>
    manager.pipe(
      Effect.catchTag('ManagementOnly', managementOnly),
      Effect.andThen(() => httpEffect),
    ),
  ),
)

export const AuthLive = HttpApiBuilder.group(
  Api,
  'auth',
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts
    return handlers
      .handle('status', () =>
        toHttp(
          Effect.gen(function* () {
            const status = yield* accounts.status(isLocal(yield* sourceRequest))
            return { ...status, me: yield* accounts.session(yield* sessionToken) }
          }),
        ),
      )
      .handle('setup', ({ payload }) =>
        toHttp(Effect.flatMap(sourceRequest, (request) => accounts.setup(payload, isLocal(request)))).pipe(
          Effect.flatMap(withSession),
        ),
      )
      .handle('login', ({ payload }) =>
        toHttp(
          Effect.flatMap(sourceRequest, (request) =>
            accounts.login(payload.email, payload.password, request.headers.get('cf-connecting-ip') ?? 'local'),
          ),
        ).pipe(Effect.flatMap(withSession)),
      )
      .handle(
        'logout',
        Effect.fn(function* () {
          yield* toHttp(accounts.logout(yield* sessionToken))
          yield* setSession('', 0)
          return { ok: true }
        }),
      )
      .handle('preview', ({ params }) => toHttp(accounts.preview(params.id)))
      .handle('accept', ({ params, payload }) =>
        toHttp(accounts.accept(params.id, payload)).pipe(Effect.flatMap(withSession)),
      )
  }),
)

export const TeamLive = HttpApiBuilder.group(
  Api,
  'team',
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts
    return handlers
      .handle('list', () => toHttp(accounts.team()))
      .handle('invite', ({ payload }) => toHttp(accounts.invite(payload)))
      .handle('revoke', ({ params }) => toHttp(accounts.revoke(params.id)))
      .handle('member', ({ params, payload }) => toHttp(accounts.member(params.id, payload)))
  }),
)
