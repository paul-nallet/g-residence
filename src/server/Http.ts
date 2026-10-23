import { Visits } from '../services/Visits.ts'
import { VisitsLive } from './VisitsHttp.ts'
import { Effect, Layer } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Accounts } from '../services/Accounts.ts'
import { AiPort, AiProvider, unavailableAi, type AiProviderPort } from '../services/AiProvider.ts'
import { anthropicProvider } from '../services/anthropicProvider.ts'
import { mistralProvider, mistralVoice } from '../services/mistralProvider.ts'
import { Agenda } from '../services/Agenda.ts'
import { Cleaning } from '../services/Cleaning.ts'
import { Feedback } from '../services/Feedback.ts'
import { Database, d1Database, Sql, type DatabasePort } from '../services/Database.ts'
import { Lots } from '../services/Lots.ts'
import { Meters } from '../services/Meters.ts'
import { Revenue } from '../services/Revenue.ts'
import { Stays } from '../services/Stays.ts'
import { Stock } from '../services/Stock.ts'
import { Studio } from '../services/Studio.ts'
import { unavailableVoice, Voice, VoicePort, type VoiceProviderPort } from '../services/Voice.ts'
import { Sync } from '../services/Sync.ts'
import { Technical } from '../services/Technical.ts'
import { AuthLive, AuthorizationLive, ManagementLive, SameOriginLive, TeamLive } from './AccountsHttp.ts'
import { CleaningLive } from './CleaningHttp.ts'
import { FeedbackLive } from './FeedbackHttp.ts'
import { schemaErrorsAsBadRequest } from './errors.ts'
import { MetersLive } from './MetersHttp.ts'
import {
  BuildingsLive,
  CalendarLive,
  InspectionsLive,
  LotsLive,
  NoticesLive,
  ReportsLive,
  StaysLive,
} from './ResidenceHttp.ts'
import { memoryReadCache, withReadCache } from './ReadCache.ts'
import { RevenueLive } from './RevenueHttp.ts'
import { StockLive } from './StockHttp.ts'
import { StudioLive } from './StudioHttp.ts'
import { SyncLive } from './SyncHttp.ts'
import { TechnicalLive } from './TechnicalHttp.ts'

export { SESSION_COOKIE } from './AccountsHttp.ts'

const SystemLive = HttpApiBuilder.group(Api, 'system', (handlers) =>
  handlers.handle('health', () =>
    Effect.succeed({ application: 'gresidence' as const, status: 'ready' as const, stage: 'v1' as const }),
  ),
)

export const createApiHandler = (
  db: DatabasePort,
  adminEmail = '',
  ai: AiProviderPort = unavailableAi,
  voice: VoiceProviderPort = unavailableVoice,
) => {
  const sql = Sql.layer.pipe(Layer.provide(Layer.succeed(Database, db)))
  const domain = Layer.mergeAll(
    Accounts.layer(adminEmail),
    Lots.layer.pipe(Layer.provideMerge(Agenda.layer)),
    Stays.layer,
    Meters.layer,
    Revenue.layer,
    Stock.layer,
    Cleaning.layer,
    Technical.layer,
    Visits.layer,
    Feedback.layer,
    Sync.layer,
  ).pipe(Layer.provide(sql))
  const voiceLayer = Voice.layer.pipe(Layer.provide(Layer.succeed(VoicePort, voice)))
  const services = Studio.layer.pipe(
    Layer.provide(AiProvider.layer.pipe(Layer.provide(Layer.succeed(AiPort, ai)))),
    Layer.provideMerge(voiceLayer),
    Layer.provideMerge(domain),
  )
  const api = HttpApiBuilder.layer(Api).pipe(
    Layer.provide([
      SystemLive,
      AuthLive,
      TeamLive,
      BuildingsLive,
      LotsLive,
      StaysLive,
      NoticesLive,
      InspectionsLive,
      CalendarLive,
      ReportsLive,
      MetersLive,
      RevenueLive,
      StockLive,
      CleaningLive,
      TechnicalLive,
      VisitsLive,
      FeedbackLive,
      StudioLive,
      SyncLive,
    ]),
    Layer.provide([AuthorizationLive, ManagementLive, SameOriginLive]),
    Layer.provide(services),
  )
  const unknown = HttpRouter.add(
    '*',
    '/api/*',
    HttpServerResponse.jsonUnsafe({ error: 'Route inconnue.' }, { status: 404 }),
  )
  const noStore = HttpRouter.middleware(
    (effect) => Effect.map(schemaErrorsAsBadRequest(effect), HttpServerResponse.setHeader('Cache-Control', 'no-store')),
    { global: true },
  )
  return HttpRouter.toWebHandler(Layer.mergeAll(api, unknown, noStore).pipe(Layer.provide(HttpServer.layerServices)), {
    disableLogger: true,
  })
}
type AiEnv = { AI_PROVIDER: string; AI_MODEL: string; AI_API_KEY?: string; AI_VOICE?: string; MISTRAL_API_KEY?: string }
const aiFromEnv = (env: AiEnv): AiProviderPort =>
  !env.AI_API_KEY
    ? unavailableAi
    : env.AI_PROVIDER === 'anthropic'
      ? anthropicProvider({ apiKey: env.AI_API_KEY, model: env.AI_MODEL })
      : env.AI_PROVIDER === 'mistral'
        ? mistralProvider({ apiKey: env.AI_API_KEY, model: env.AI_MODEL })
        : unavailableAi
const voiceFromEnv = (env: AiEnv): VoiceProviderPort => {
  const apiKey = env.MISTRAL_API_KEY || (env.AI_PROVIDER === 'mistral' ? env.AI_API_KEY : undefined)
  return apiKey ? mistralVoice({ apiKey, voice: env.AI_VOICE }) : unavailableVoice
}
const handlers = new WeakMap<Env, (request: Request) => Promise<Response>>()
export const apiHandler = (request: Request, env: Env) => {
  let handler = handlers.get(env)
  if (!handler) {
    const db = d1Database(env.DB)
    handler = withReadCache(
      createApiHandler(db, env.ADMIN_EMAIL, aiFromEnv(env), voiceFromEnv(env)).handler,
      db,
      memoryReadCache(),
    )
    handlers.set(env, handler)
  }
  return handler(request)
}
