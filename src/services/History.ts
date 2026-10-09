import type { Me } from '../domain/accounts.ts'
import { sql, type Statement } from './Database.ts'

export const auditStatement = (
  me: Me,
  at: string,
  lotId: string,
  action: string,
  before: unknown,
  after: unknown,
): Statement =>
  sql(
    'INSERT INTO history(id,residence_id,lot_id,actor_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    me.residenceId,
    lotId,
    me.id,
    action,
    before === null ? null : JSON.stringify(before),
    JSON.stringify(after),
    at,
  )
