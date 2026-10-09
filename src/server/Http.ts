import { Effect, Layer } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Accounts } from '../services/Accounts.ts'
import { Agenda } from '../services/Agenda.ts'
import { Cleaning } from '../services/Cleaning.ts'
import { Database, d1Database, Sql, type DatabasePort } from '../services/Database.ts'
import { Lots } from '../services/Lots.ts'
import { Meters } from '../services/Meters.ts'
import { Revenue } from '../services/Revenue.ts'
import { Stays } from '../services/Stays.ts'
import { Stock } from '../services/Stock.ts'
import { AuthLive, AuthorizationLive, ManagementLive, SameOriginLive, TeamLive } from './AccountsHttp.ts'
import { CleaningLive } from './CleaningHttp.ts'
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
import { RevenueLive } from './RevenueHttp.ts'
import { StockLive } from './StockHttp.ts'

export { SESSION_COOKIE } from './AccountsHttp.ts'

const SystemLive = HttpApiBuilder.group(Api, 'system', (handlers) =>
  handlers.handle('health', () =>
    Effect.succeed({ application: 'gresidence' as const, status: 'ready' as const, stage: 'v1' as const }),
  ),
)

export const createApiHandler = (db: DatabasePort, adminEmail = '') => {
  const sql = Sql.layer.pipe(Layer.provide(Layer.succeed(Database, db)))
  const services = Layer.mergeAll(
    Accounts.layer(adminEmail),
    Lots.layer.pipe(Layer.provideMerge(Agenda.layer)),
    Stays.layer,
    Meters.layer,
    Revenue.layer,
    Stock.layer,
    Cleaning.layer,
  ).pipe(Layer.provide(sql))
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
const handlers = new WeakMap<Env, ReturnType<typeof createApiHandler>>()
export const apiHandler = (request: Request, env: Env) => {
  let handler = handlers.get(env)
  if (!handler) {
    handler = createApiHandler(d1Database(env.DB), env.ADMIN_EMAIL)
    handlers.set(env, handler)
  }
  return handler.handler(request)
}
