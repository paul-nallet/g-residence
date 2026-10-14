import { Context, Effect, Layer } from 'effect'
import { manager } from '../domain/CurrentUser.ts'
import type { Me } from '../domain/accounts.ts'
import { currentDay, now } from '../domain/clock.ts'
import { InvalidInput } from '../domain/errors.ts'
import {
  MAX_ITEM_CATEGORIES,
  MAX_VIEW_CATEGORIES,
  MAX_VIEWS,
  type Movement,
  movementDelta,
  type MovementInput,
  type MovementKind,
  movementYear,
  PAGE_SIZE,
  StockCategoryNotFound,
  StockInsufficient,
  type StockItem,
  type StockItemCreate,
  type StockItemInput,
  StockItemNameTaken,
  StockItemNotFound,
  type StockViewInput,
  StockViewNameTaken,
  StockViewNotFound,
  uniqueCategoryNames,
} from '../domain/stock.ts'
import { folded, onViolation, searchPattern, sql, Sql } from './Database.ts'

type ItemRow = Omit<StockItem, 'categories'> & { categories: string }
const level = `CASE WHEN i.quantity=0 THEN 'out' WHEN i.quantity<=i.threshold THEN 'low' ELSE 'ok' END`
const categoryNames = `(SELECT json_group_array(name) FROM (SELECT c.name FROM stock_item_categories l JOIN stock_categories c ON c.id=l.category_id
  WHERE l.item_id=i.id AND l.residence_id=i.residence_id ORDER BY c.name COLLATE NOCASE))`
const parseCategories = <A extends { categories: string }>(row: A) => ({
  ...row,
  categories: JSON.parse(row.categories) as string[],
})

const cleanItem = Effect.fn('Stock.cleanItem')(function* (input: typeof StockItemInput.Type) {
  const categories = uniqueCategoryNames(input.categories)
  if (categories.length > MAX_ITEM_CATEGORIES)
    return yield* new InvalidInput({ message: 'Vingt catégories au maximum par article.' })
  return { name: input.name, categories, unit: input.unit, threshold: input.threshold }
})
const linkCategories = (me: Me, itemId: string, categories: readonly string[]) => [
  sql('DELETE FROM stock_item_categories WHERE item_id=? AND residence_id=?', itemId, me.residenceId),
  ...categories.flatMap((name) => [
    sql(
      'INSERT OR IGNORE INTO stock_categories(id,residence_id,name) VALUES(?,?,?)',
      crypto.randomUUID(),
      me.residenceId,
      name,
    ),
    sql(
      'INSERT INTO stock_item_categories(residence_id,item_id,category_id) SELECT residence_id,?,id FROM stock_categories WHERE residence_id=? AND name=?',
      itemId,
      me.residenceId,
      name,
    ),
  ]),
]
const itemChange = (me: Me, at: string, itemId: string, before: unknown, after: unknown) =>
  sql(
    'INSERT INTO stock_item_changes(id,residence_id,item_id,actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    me.residenceId,
    itemId,
    me.id,
    before === null ? null : JSON.stringify(before),
    JSON.stringify(after),
    at,
  )
const movementStatements = (me: Me, at: string, itemId: string, input: typeof MovementInput.Type) => {
  const delta = movementDelta(input.kind, input.quantity)
  return [
    sql(
      `INSERT INTO stock_movements(id,residence_id,item_id,kind,delta,quantity_after,occurred_on,comment,actor_id,created_at)
      SELECT ?,residence_id,id,?,COALESCE(?,?-quantity),COALESCE(quantity+?,?),?,?,?,? FROM stock_items WHERE id=? AND residence_id=?`,
      crypto.randomUUID(),
      input.kind,
      delta,
      input.quantity,
      delta,
      input.quantity,
      input.occurred_on,
      input.comment,
      me.id,
      at,
      itemId,
      me.residenceId,
    ),
    sql(
      'UPDATE stock_items SET quantity=COALESCE(quantity+?,?) WHERE id=? AND residence_id=?',
      delta,
      input.quantity,
      itemId,
      me.residenceId,
    ),
  ]
}
const itemNameTaken = onViolation('UNIQUE constraint failed: stock_items.', () => new StockItemNameTaken())

const make = Effect.gen(function* () {
  const db = yield* Sql

  const find = Effect.fn('Stock.find')(function* (id: string) {
    const me = yield* manager
    const item = yield* db.first<{ name: string; categories: string; unit: string; threshold: number }>(
      sql(
        `SELECT i.name,${categoryNames} AS categories,i.unit,i.threshold FROM stock_items i WHERE i.id=? AND i.residence_id=?`,
        id,
        me.residenceId,
      ),
    )
    if (!item) return yield* new StockItemNotFound()
    return { me, before: parseCategories(item) }
  })
  const findView = Effect.fn('Stock.findView')(function* (me: Me, viewId: string) {
    const view = yield* db.first<{ id: string }>(
      sql('SELECT id FROM stock_views WHERE id=? AND residence_id=?', viewId, me.residenceId),
    )
    if (!view) return yield* new StockViewNotFound()
  })

  const list = Effect.fn('Stock.list')(function* (input: {
    readonly q?: string
    readonly category?: string
    readonly view?: string
    readonly level?: 'all' | 'alert'
    readonly page?: number
  }) {
    const me = yield* manager
    const start = ((input.page ?? 1) - 1) * PAGE_SIZE
    const search = searchPattern(input.q)
    const category = input.category ?? '',
      view = input.view ?? ''
    const inCategory = `(?='' OR EXISTS(SELECT 1 FROM stock_item_categories l WHERE l.item_id=i.id AND l.residence_id=i.residence_id AND l.category_id=?))`
    const inView = `(?='' OR EXISTS(SELECT 1 FROM stock_item_categories l JOIN stock_view_categories v ON v.category_id=l.category_id AND v.residence_id=l.residence_id
        WHERE l.item_id=i.id AND l.residence_id=i.residence_id AND v.view_id=?))`
    const scope = `i.residence_id=? AND ${inView} AND ${inCategory}`
    const scopeValues = [me.residenceId, view, view, category, category]
    const filter = `${scope} AND (${folded('i.name')} LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM stock_item_categories l JOIN stock_categories c ON c.id=l.category_id
        WHERE l.item_id=i.id AND l.residence_id=i.residence_id AND ${folded('c.name')} LIKE ? ESCAPE '\\')) AND (?='all' OR ${level}<>'ok')`
    const values = [...scopeValues, search, search, input.level ?? 'all']
    const [rows, count, low, categories, views] = yield* Effect.all([
      db.all<ItemRow>(
        sql(
          `SELECT i.id,i.name,${categoryNames} AS categories,i.unit,i.threshold,i.quantity,${level} AS level FROM stock_items i WHERE ${filter}
          ORDER BY CASE ${level} WHEN 'out' THEN 0 WHEN 'low' THEN 1 ELSE 2 END,i.name COLLATE NOCASE,i.id LIMIT ? OFFSET ?`,
          ...values,
          PAGE_SIZE,
          start,
        ),
      ),
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM stock_items i WHERE ${filter}`, ...values)),
      db.first<{ total: number }>(
        sql(`SELECT COUNT(*) AS total FROM stock_items i WHERE ${scope} AND ${level}<>'ok'`, ...scopeValues),
      ),
      db.all<{ id: string; name: string }>(
        sql(
          `SELECT c.id,c.name FROM stock_categories c WHERE c.residence_id=?
          AND (EXISTS(SELECT 1 FROM stock_item_categories l WHERE l.category_id=c.id) OR EXISTS(SELECT 1 FROM stock_view_categories v WHERE v.category_id=c.id))
          ORDER BY c.name COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; categories: string; low: number }>(
        sql(
          `SELECT s.id,s.name,(SELECT json_group_array(category_id) FROM stock_view_categories v WHERE v.view_id=s.id) AS categories,
          (SELECT COUNT(*) FROM stock_items i WHERE i.residence_id=s.residence_id AND ${level}<>'ok' AND EXISTS(SELECT 1 FROM stock_item_categories l
            JOIN stock_view_categories v ON v.category_id=l.category_id WHERE l.item_id=i.id AND v.view_id=s.id)) AS low
          FROM stock_views s WHERE s.residence_id=? ORDER BY s.name COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
    ])
    return {
      items: rows.map(parseCategories),
      total: count?.total ?? 0,
      low: low?.total ?? 0,
      categories,
      views: views.map(parseCategories),
    }
  })

  const saveView = Effect.fn('Stock.saveView')(function* (viewId: string | null, input: typeof StockViewInput.Type) {
    const me = yield* manager
    const categories = [...new Set(input.categories)]
    if (categories.length > MAX_VIEW_CATEGORIES)
      return yield* new InvalidInput({ message: 'Cinquante catégories au maximum par vue.' })
    if (viewId) yield* findView(me, viewId)
    else {
      const count = yield* db.first<{ total: number }>(
        sql('SELECT COUNT(*) AS total FROM stock_views WHERE residence_id=?', me.residenceId),
      )
      if ((count?.total ?? 0) >= MAX_VIEWS) return yield* new InvalidInput({ message: 'Huit vues au maximum.' })
    }
    const known = yield* db.all<{ id: string }>(
      sql(
        `SELECT id FROM stock_categories WHERE residence_id=? AND id IN (${categories.map(() => '?').join(',')})`,
        me.residenceId,
        ...categories,
      ),
    )
    if (known.length !== categories.length) return yield* new StockCategoryNotFound()
    const id = viewId ?? crypto.randomUUID()
    yield* db
      .batch([
        viewId
          ? sql('UPDATE stock_views SET name=? WHERE id=? AND residence_id=?', input.name, id, me.residenceId)
          : sql('INSERT INTO stock_views(id,residence_id,name) VALUES(?,?,?)', id, me.residenceId, input.name),
        sql('DELETE FROM stock_view_categories WHERE view_id=? AND residence_id=?', id, me.residenceId),
        ...categories.map((category) =>
          sql(
            'INSERT INTO stock_view_categories(residence_id,view_id,category_id) VALUES(?,?,?)',
            me.residenceId,
            id,
            category,
          ),
        ),
      ])
      .pipe(onViolation('UNIQUE constraint failed: stock_views.', () => new StockViewNameTaken()))
    return { ok: true }
  })

  const removeView = Effect.fn('Stock.removeView')(function* (viewId: string) {
    const me = yield* manager
    yield* findView(me, viewId)
    yield* db.batch([
      sql('DELETE FROM stock_view_categories WHERE view_id=? AND residence_id=?', viewId, me.residenceId),
      sql('DELETE FROM stock_views WHERE id=? AND residence_id=?', viewId, me.residenceId),
    ])
    return { ok: true }
  })

  const item = Effect.fn('Stock.item')(function* (id: string) {
    const me = yield* manager
    const row = yield* db.first<ItemRow>(
      sql(
        `SELECT i.id,i.name,${categoryNames} AS categories,i.unit,i.threshold,i.quantity,${level} AS level FROM stock_items i WHERE i.id=? AND i.residence_id=?`,
        id,
        me.residenceId,
      ),
    )
    if (!row) return yield* new StockItemNotFound()
    return parseCategories(row)
  })

  const create = Effect.fn('Stock.create')(function* (input: typeof StockItemCreate.Type) {
    const me = yield* manager
    const cleaned = yield* cleanItem(input),
      id = crypto.randomUUID(),
      at = yield* now
    yield* db
      .batch([
        sql(
          'INSERT INTO stock_items(id,residence_id,name,unit,threshold) VALUES(?,?,?,?,?)',
          id,
          me.residenceId,
          cleaned.name,
          cleaned.unit,
          cleaned.threshold,
        ),
        ...linkCategories(me, id, cleaned.categories),
        itemChange(me, at, id, null, cleaned),
        ...(input.initial > 0
          ? movementStatements(me, at, id, {
              kind: 'count',
              quantity: input.initial,
              occurred_on: yield* currentDay,
              comment: 'Stock initial',
            })
          : []),
      ])
      .pipe(itemNameTaken)
    return { ok: true }
  })

  const update = Effect.fn('Stock.update')(function* (id: string, input: typeof StockItemInput.Type) {
    const { me, before } = yield* find(id)
    const cleaned = yield* cleanItem(input)
    const at = yield* now
    yield* db
      .batch([
        sql(
          'UPDATE stock_items SET name=?,unit=?,threshold=? WHERE id=? AND residence_id=?',
          cleaned.name,
          cleaned.unit,
          cleaned.threshold,
          id,
          me.residenceId,
        ),
        ...linkCategories(me, id, cleaned.categories),
        itemChange(me, at, id, before, cleaned),
      ])
      .pipe(itemNameTaken)
    return { ok: true }
  })

  const remove = Effect.fn('Stock.remove')(function* (id: string) {
    const { me } = yield* find(id)
    yield* db.batch([
      sql('DELETE FROM stock_movements WHERE item_id=? AND residence_id=?', id, me.residenceId),
      sql('DELETE FROM stock_item_categories WHERE item_id=? AND residence_id=?', id, me.residenceId),
      sql('DELETE FROM stock_item_changes WHERE item_id=? AND residence_id=?', id, me.residenceId),
      sql('DELETE FROM stock_items WHERE id=? AND residence_id=?', id, me.residenceId),
    ])
    return { ok: true }
  })

  const movements = Effect.fn('Stock.movements')(function* (id: string, page = 1) {
    const { me } = yield* find(id)
    const [items, count] = yield* Effect.all([
      db.all<Movement>(
        sql(
          `SELECT m.id,m.kind,m.delta,m.quantity_after,m.occurred_on,m.comment,u.name AS actor,m.created_at
          FROM stock_movements m JOIN users u ON u.id=m.actor_id
          WHERE m.item_id=? AND m.residence_id=? ORDER BY m.rowid DESC LIMIT ? OFFSET ?`,
          id,
          me.residenceId,
          PAGE_SIZE,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql('SELECT COUNT(*) AS total FROM stock_movements WHERE item_id=? AND residence_id=?', id, me.residenceId),
      ),
    ])
    return { items, total: count?.total ?? 0 }
  })

  const trend = Effect.fn('Stock.trend')(function* (id: string, year: number) {
    const { me } = yield* find(id)
    const [opening, totals] = yield* Effect.all([
      db.first<{ total: number | null }>(
        sql(
          'SELECT SUM(delta) AS total FROM stock_movements WHERE item_id=? AND residence_id=? AND occurred_on<?',
          id,
          me.residenceId,
          `${year}-01-01`,
        ),
      ),
      db.all<{ month: string; kind: MovementKind; delta: number }>(
        sql(
          `SELECT substr(occurred_on,1,7) AS month,kind,SUM(delta) AS delta FROM stock_movements
          WHERE item_id=? AND residence_id=? AND occurred_on BETWEEN ? AND ? GROUP BY month,kind`,
          id,
          me.residenceId,
          `${year}-01-01`,
          `${year}-12-31`,
        ),
      ),
    ])
    return movementYear(year, opening?.total ?? 0, totals, yield* currentDay)
  })

  const move = Effect.fn('Stock.move')(function* (id: string, input: typeof MovementInput.Type) {
    const { me } = yield* find(id)
    if (input.occurred_on > (yield* currentDay))
      return yield* new InvalidInput({ message: 'La date du mouvement ne peut pas être dans le futur.' })
    if (input.kind !== 'count' && input.quantity < 1)
      return yield* new InvalidInput({ message: 'Saisissez une quantité d’au moins 1.' })
    if (input.kind === 'count') {
      const latest = yield* db.first<{ day: string | null }>(
        sql(
          'SELECT MAX(occurred_on) AS day FROM stock_movements WHERE item_id=? AND residence_id=?',
          id,
          me.residenceId,
        ),
      )
      if (latest?.day && input.occurred_on < latest.day)
        return yield* new InvalidInput({
          message:
            'Un inventaire ne peut pas précéder le dernier mouvement, daté du ' +
            latest.day.split('-').reverse().join('/') +
            '.',
        })
    }
    yield* db
      .batch(movementStatements(me, yield* now, id, input))
      .pipe(onViolation('stock_not_negative', () => new StockInsufficient()))
    return { ok: true }
  })

  return { list, saveView, removeView, item, create, update, remove, movements, trend, move }
})

export class Stock extends Context.Service<Stock, Effect.Success<typeof make>>()('gresidence/Stock') {
  static readonly layer = Layer.effect(Stock, make)
}
