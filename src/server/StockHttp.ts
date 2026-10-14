import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { StockError } from '../domain/stock.ts'
import { Stock } from '../services/Stock.ts'
import { conflict, httpErrors, notFound } from './errors.ts'

const toHttp = httpErrors<StockError>({
  StockItemNotFound: notFound('Article introuvable.'),
  StockViewNotFound: notFound('Vue introuvable.'),
  StockCategoryNotFound: notFound('Catégorie introuvable.'),
  StockItemNameTaken: conflict('Un article porte déjà ce nom dans cette résidence.'),
  StockViewNameTaken: conflict('Une vue porte déjà ce nom.'),
  StockInsufficient: conflict('Stock insuffisant : la sortie dépasse la quantité disponible.'),
})

export const StockLive = HttpApiBuilder.group(
  Api,
  'stock',
  Effect.fn(function* (handlers) {
    const stock = yield* Stock
    return handlers
      .handle('list', ({ query }) => toHttp(stock.list(query)))
      .handle('createView', ({ payload }) => toHttp(stock.saveView(null, payload)))
      .handle('updateView', ({ params, payload }) => toHttp(stock.saveView(params.id, payload)))
      .handle('removeView', ({ params }) => toHttp(stock.removeView(params.id)))
      .handle('detail', ({ params }) => toHttp(stock.item(params.id)))
      .handle('create', ({ payload }) => toHttp(stock.create(payload)))
      .handle('update', ({ params, payload }) => toHttp(stock.update(params.id, payload)))
      .handle('threshold', ({ params, payload }) => toHttp(stock.setThreshold(params.id, payload.threshold)))
      .handle('remove', ({ params }) => toHttp(stock.remove(params.id)))
      .handle('movements', ({ params, query }) => toHttp(stock.movements(params.id, query.page)))
      .handle('trend', ({ params, query }) => toHttp(stock.trend(params.id, query.year)))
      .handle('move', ({ params, payload }) => toHttp(stock.move(params.id, payload)))
  }),
)
