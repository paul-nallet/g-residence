import { Schema, SchemaIssue } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'
import { CurrentUser } from '../domain/CurrentUser.ts'
import {
  AcceptInput,
  InviteInput,
  InvitePreview,
  LoginInput,
  Me,
  MemberInput,
  SetupInput,
  Status,
  Team,
} from '../domain/accounts.ts'
import { Event, Report } from '../domain/agenda.ts'
import {
  CleaningItemInput,
  CleaningOptions,
  CleaningPoint,
  CleaningReschedule,
  CleaningStatusInput,
  CleaningTask,
  CleaningTaskCreate,
  CleaningTaskDetail,
  CleaningTaskInput,
  CleaningTaskPage,
  CleaningTemplate,
  CleaningTemplateInput,
} from '../domain/cleaning.ts'
import { Building, BuildingInput, LotDetail, LotInput, LotPage, LotQuery } from '../domain/lots.ts'
import { ConsumptionYear, Meter, MeterInput, MeterPage, ReadingInput, ReadingPage } from '../domain/meters.ts'
import {
  Period,
  RevenueEntryInput,
  RevenueEntryPage,
  RevenuePage,
  RevenueSource,
  RevenueSourceInput,
  RevenueYear,
  RevenueYearQuery,
} from '../domain/revenue.ts'
import { CivilDate, CivilMonth, Health, Ok, PageNumber } from '../domain/shared.ts'
import { InspectionInput, NoticeInput, StayAction, StayInput } from '../domain/stays.ts'
import {
  MovementInput,
  MovementPage,
  MovementYear,
  StockItem,
  StockItemCreate,
  StockItemInput,
  StockLevelFilter,
  StockPage,
  StockViewInput,
} from '../domain/stock.ts'

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  'BadRequest',
  { error: Schema.String },
  { httpApiStatus: 400 },
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { error: Schema.String },
  { httpApiStatus: 401 },
) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  'Forbidden',
  { error: Schema.String },
  { httpApiStatus: 403 },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  { error: Schema.String },
  { httpApiStatus: 404 },
) {}
export class Conflict extends Schema.TaggedError<Conflict>()(
  'Conflict',
  { error: Schema.String },
  { httpApiStatus: 409 },
) {}
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()(
  'TooManyRequests',
  { error: Schema.String },
  { httpApiStatus: 429 },
) {}
export const errors = [BadRequest, Unauthorized, Forbidden, NotFound, Conflict, TooManyRequests] as const
const invalidData = 'Données invalides.'
const annotatedMessage = (issue: SchemaIssue.Leaf) => {
  const message = 'ast' in issue ? issue.ast.annotations?.message : undefined
  return typeof message === 'string' ? message : undefined
}
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: (issue) => annotatedMessage(issue) ?? invalidData,
  checkHook: (issue) => SchemaIssue.defaultCheckHook(issue) ?? invalidData,
})
export const issueMessage = (issue: SchemaIssue.Issue) => formatIssue(issue).issues[0]?.message ?? invalidData
export { CurrentUser }
export const Session = HttpApiSecurity.apiKey({ key: 'gresidence_session', in: 'cookie' })
export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentUser }>()(
  'gresidence/Authorization',
  { error: errors, security: { session: Session } },
) {}
export class Management extends HttpApiMiddleware.Service<Management, { requires: CurrentUser }>()(
  'gresidence/Management',
  { error: Forbidden },
) {}
export class SameOrigin extends HttpApiMiddleware.Service<SameOrigin>()('gresidence/SameOrigin', {
  error: Forbidden,
}) {}
const id = { id: Schema.String }

export class SystemGroup extends HttpApiGroup.make('system').add(
  HttpApiEndpoint.get('health', '/health', { success: Health }),
) {}
export class AuthGroup extends HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.get('status', '/auth/status', { success: Status, error: errors }),
    HttpApiEndpoint.post('setup', '/auth/setup', { payload: SetupInput, success: Me, error: errors }),
    HttpApiEndpoint.post('login', '/auth/login', { payload: LoginInput, success: Me, error: errors }),
    HttpApiEndpoint.post('logout', '/auth/logout', { success: Ok, error: errors }),
    HttpApiEndpoint.get('preview', '/auth/invitations/:id', { params: id, success: InvitePreview, error: errors }),
    HttpApiEndpoint.post('accept', '/auth/invitations/:id', {
      params: id,
      payload: AcceptInput,
      success: Me,
      error: errors,
    }),
  )
  .middleware(SameOrigin) {}
export class TeamGroup extends HttpApiGroup.make('team')
  .add(
    HttpApiEndpoint.get('list', '/team', { success: Team, error: errors }),
    HttpApiEndpoint.post('invite', '/team/invitations', {
      payload: InviteInput,
      success: Schema.Struct({ token: Schema.String }),
      error: errors,
    }),
    HttpApiEndpoint.delete('revoke', '/team/invitations/:id', { params: id, success: Ok, error: errors }),
    HttpApiEndpoint.patch('member', '/team/members/:id', {
      params: id,
      payload: MemberInput,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class BuildingsGroup extends HttpApiGroup.make('buildings')
  .add(
    HttpApiEndpoint.get('list', '/buildings', { success: Schema.Array(Building), error: errors }),
    HttpApiEndpoint.post('create', '/buildings', { payload: BuildingInput, success: Ok, error: errors }),
  )
  .middleware(Authorization) {}
export class LotsGroup extends HttpApiGroup.make('lots')
  .add(
    HttpApiEndpoint.get('list', '/lots', {
      query: LotQuery,
      success: LotPage,
      error: errors,
    }),
    HttpApiEndpoint.get('detail', '/lots/:id', { params: id, success: LotDetail, error: errors }),
    HttpApiEndpoint.post('create', '/lots', { payload: LotInput, success: Ok, error: errors }),
    HttpApiEndpoint.patch('update', '/lots/:id', { params: id, payload: LotInput, success: Ok, error: errors }),
    HttpApiEndpoint.patch('archive', '/lots/:id/archive', {
      params: id,
      payload: Schema.Struct({ archived: Schema.Boolean }),
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class StaysGroup extends HttpApiGroup.make('stays')
  .add(
    HttpApiEndpoint.post('create', '/lots/:id/stays', {
      params: id,
      payload: StayInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('update', '/stays/:id', { params: id, payload: StayInput, success: Ok, error: errors }),
    HttpApiEndpoint.post('action', '/stays/:id/actions', {
      params: id,
      payload: StayAction,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class NoticesGroup extends HttpApiGroup.make('notices')
  .add(
    HttpApiEndpoint.post('create', '/stays/:id/notices', {
      params: id,
      payload: NoticeInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('update', '/notices/:id', {
      params: id,
      payload: NoticeInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.post('withdraw', '/notices/:id/withdraw', { params: id, success: Ok, error: errors }),
  )
  .middleware(Authorization) {}
export class InspectionsGroup extends HttpApiGroup.make('inspections')
  .add(
    HttpApiEndpoint.post('create', '/stays/:id/inspections', {
      params: id,
      payload: InspectionInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('update', '/inspections/:id', {
      params: id,
      payload: InspectionInput,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class CalendarGroup extends HttpApiGroup.make('calendar')
  .add(
    HttpApiEndpoint.get('list', '/calendar', {
      query: { from: CivilDate, to: CivilDate },
      success: Schema.Array(Event),
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class ReportsGroup extends HttpApiGroup.make('reports')
  .add(
    HttpApiEndpoint.get('weekly', '/reports/weekly', {
      query: { date: CivilDate },
      success: Report,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class MetersGroup extends HttpApiGroup.make('meters')
  .add(
    HttpApiEndpoint.get('list', '/meters', {
      query: {
        month: CivilMonth,
        pending: Schema.optionalKey(Schema.Literals(['true'])),
        page: Schema.optionalKey(PageNumber(1000000)),
      },
      success: MeterPage,
      error: errors,
    }),
    HttpApiEndpoint.get('detail', '/meters/:id', { params: id, success: Meter, error: errors }),
    HttpApiEndpoint.post('create', '/meters', { payload: MeterInput, success: Ok, error: errors }),
    HttpApiEndpoint.get('readings', '/meters/:id/readings', {
      params: id,
      query: { page: Schema.optionalKey(PageNumber(1000000)) },
      success: ReadingPage,
      error: errors,
    }),
    HttpApiEndpoint.get('consumption', '/meters/:id/consumption', {
      params: id,
      query: {
        year: Schema.NumberFromString.check(
          Schema.isInt({ message: 'Année invalide.' }),
          Schema.isGreaterThanOrEqualTo(2000, { message: 'Année invalide.' }),
          Schema.isLessThanOrEqualTo(2100, { message: 'Année invalide.' }),
        ),
      },
      success: ConsumptionYear,
      error: errors,
    }),
    HttpApiEndpoint.post('record', '/meters/:id/readings', {
      params: id,
      payload: ReadingInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('correct', '/meters/:id/readings/:readingId', {
      params: { ...id, readingId: Schema.String },
      payload: ReadingInput,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Authorization) {}
export class StockGroup extends HttpApiGroup.make('stock')
  .add(
    HttpApiEndpoint.get('list', '/stock', {
      query: {
        q: Schema.optionalKey(Schema.String),
        category: Schema.optionalKey(Schema.String),
        view: Schema.optionalKey(Schema.String),
        level: Schema.optionalKey(StockLevelFilter),
        page: Schema.optionalKey(PageNumber(1000000)),
      },
      success: StockPage,
      error: errors,
    }),
    HttpApiEndpoint.post('createView', '/stock/views', { payload: StockViewInput, success: Ok, error: errors }),
    HttpApiEndpoint.patch('updateView', '/stock/views/:id', {
      params: id,
      payload: StockViewInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.delete('removeView', '/stock/views/:id', { params: id, success: Ok, error: errors }),
    HttpApiEndpoint.get('detail', '/stock/:id', { params: id, success: StockItem, error: errors }),
    HttpApiEndpoint.post('create', '/stock', { payload: StockItemCreate, success: Ok, error: errors }),
    HttpApiEndpoint.patch('update', '/stock/:id', {
      params: id,
      payload: StockItemInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.delete('remove', '/stock/:id', { params: id, success: Ok, error: errors }),
    HttpApiEndpoint.get('movements', '/stock/:id/movements', {
      params: id,
      query: { page: Schema.optionalKey(PageNumber(1000000)) },
      success: MovementPage,
      error: errors,
    }),
    HttpApiEndpoint.get('trend', '/stock/:id/trend', {
      params: id,
      query: {
        year: Schema.NumberFromString.check(
          Schema.isInt({ message: 'Année invalide.' }),
          Schema.isGreaterThanOrEqualTo(2000, { message: 'Année invalide.' }),
          Schema.isLessThanOrEqualTo(2100, { message: 'Année invalide.' }),
        ),
      },
      success: MovementYear,
      error: errors,
    }),
    HttpApiEndpoint.post('move', '/stock/:id/movements', {
      params: id,
      payload: MovementInput,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Management)
  .middleware(Authorization) {}
export class RevenueGroup extends HttpApiGroup.make('revenue')
  .add(
    HttpApiEndpoint.get('list', '/revenue', {
      query: {
        month: Period,
        pending: Schema.optionalKey(Schema.Literals(['true'])),
        page: Schema.optionalKey(PageNumber(1000000)),
      },
      success: RevenuePage,
      error: errors,
    }),
    HttpApiEndpoint.get('year', '/revenue/years/:year', {
      params: { year: RevenueYearQuery },
      success: RevenueYear,
      error: errors,
    }),
    HttpApiEndpoint.get('detail', '/revenue/:id', { params: id, success: RevenueSource, error: errors }),
    HttpApiEndpoint.post('create', '/revenue', { payload: RevenueSourceInput, success: Ok, error: errors }),
    HttpApiEndpoint.patch('update', '/revenue/:id', {
      params: id,
      payload: RevenueSourceInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.get('entries', '/revenue/:id/entries', {
      params: id,
      query: { page: Schema.optionalKey(PageNumber(1000000)) },
      success: RevenueEntryPage,
      error: errors,
    }),
    HttpApiEndpoint.post('record', '/revenue/:id/entries', {
      params: id,
      payload: RevenueEntryInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('correct', '/revenue/:id/entries/:entryId', {
      params: { ...id, entryId: Schema.String },
      payload: RevenueEntryInput,
      success: Ok,
      error: errors,
    }),
  )
  .middleware(Management)
  .middleware(Authorization) {}
export class CleaningGroup extends HttpApiGroup.make('cleaning')
  .add(
    HttpApiEndpoint.get('options', '/cleaning/options', { success: CleaningOptions, error: errors }),
    HttpApiEndpoint.get('templates', '/cleaning/templates', {
      success: Schema.Array(CleaningTemplate),
      error: errors,
    }),
    HttpApiEndpoint.post('createTemplate', '/cleaning/templates', {
      payload: CleaningTemplateInput,
      success: Schema.Struct({ id: Schema.String }),
      error: errors,
    }),
    HttpApiEndpoint.put('updateTemplate', '/cleaning/templates/:id', {
      params: id,
      payload: CleaningTemplateInput,
      success: Schema.Struct({ id: Schema.String }),
      error: errors,
    }),
    HttpApiEndpoint.delete('removeTemplate', '/cleaning/templates/:id', { params: id, success: Ok, error: errors }),
    HttpApiEndpoint.get('tasks', '/cleaning/tasks', {
      query: { from: CivilDate, to: CivilDate, agent: Schema.optionalKey(Schema.String) },
      success: Schema.Array(CleaningTask),
      error: errors,
    }),
    HttpApiEndpoint.get('lotTasks', '/cleaning/lots/:id/tasks', {
      params: id,
      query: { page: Schema.optionalKey(PageNumber(1000000)) },
      success: CleaningTaskPage,
      error: errors,
    }),
    HttpApiEndpoint.post('create', '/cleaning/tasks', { payload: CleaningTaskCreate, success: Ok, error: errors }),
    HttpApiEndpoint.post('reschedule', '/cleaning/tasks/reschedule', {
      payload: CleaningReschedule,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.get('task', '/cleaning/tasks/:id', { params: id, success: CleaningTaskDetail, error: errors }),
    HttpApiEndpoint.patch('update', '/cleaning/tasks/:id', {
      params: id,
      payload: CleaningTaskInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.post('status', '/cleaning/tasks/:id/status', {
      params: id,
      payload: CleaningStatusInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.post('addItem', '/cleaning/tasks/:id/items', {
      params: id,
      payload: CleaningPoint,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.patch('item', '/cleaning/items/:id', {
      params: id,
      payload: CleaningItemInput,
      success: Ok,
      error: errors,
    }),
    HttpApiEndpoint.delete('removeItem', '/cleaning/items/:id', { params: id, success: Ok, error: errors }),
  )
  .middleware(Authorization) {}
export class Api extends HttpApi.make('gresidence')
  .add(SystemGroup)
  .add(AuthGroup)
  .add(TeamGroup)
  .add(BuildingsGroup)
  .add(LotsGroup)
  .add(StaysGroup)
  .add(NoticesGroup)
  .add(InspectionsGroup)
  .add(CalendarGroup)
  .add(ReportsGroup)
  .add(MetersGroup)
  .add(StockGroup)
  .add(RevenueGroup)
  .add(CleaningGroup)
  .prefix('/api') {}
