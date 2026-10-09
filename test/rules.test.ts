import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appointmentInstant,
  consumptionYear,
  excelCell,
  isCivilDate,
  isLocalDateTime,
  monday,
  parisDate,
  toTSV,
} from '../src/domain/rules.ts'
import { movementYear } from '../src/domain/stock.ts'

test('dates civiles, semaines et changement d’heure Europe/Paris', () => {
  assert.equal(isCivilDate('2026-02-30'), false)
  assert.equal(isCivilDate('2026-13-01'), false)
  assert.equal(isLocalDateTime('2026-03-29T03:30'), true)
  assert.equal(isLocalDateTime('2026-02-30T03:30'), false)
  assert.equal(monday('2026-01-04'), '2025-12-29')
  assert.equal(appointmentInstant('2026-03-29T03:30'), '2026-03-29T01:30:00.000Z')
  assert.equal(appointmentInstant('2026-03-29T02:30'), undefined)
  assert.equal(appointmentInstant('2026-10-25T02:30'), undefined)
  assert.equal(parisDate('2026-10-08T22:30:00.000Z'), '2026-10-09')
})
test('collage Excel sans formule, tabulation interne ni ligne supplémentaire', () => {
  for (const value of ['=1', ' +2', '-3', '@SUM(A1)']) assert.equal(excelCell(value), "'" + value)
  assert.equal(
    toTSV([
      ['Nom', 'Commentaire'],
      ['Élodie', 'une\nligne\tet une autre'],
    ]),
    'Nom\tCommentaire\r\nÉlodie\tune ligne et une autre',
  )
})

test('copie confirmée seulement après réussite et repli en cas de refus', async () => {
  const { copyText } = await import('../frontend/lib/clipboard.ts')
  let copied = ''
  assert.equal(
    await copyText('Date\tLot', {
      writeText: async (value) => {
        copied = value
      },
    }),
    true,
  )
  assert.equal(copied, 'Date\tLot')
  assert.equal(
    await copyText('test', {
      writeText: async () => {
        throw new Error('refusé')
      },
    }),
    false,
  )
  assert.equal(await copyText('test', undefined), false)
})

test('consommation mensuelle déduite des index, sans valeur négative', () => {
  const recap = consumptionYear(2026, [
    { observed_on: '2025-12-28', value: 100 },
    { observed_on: '2026-01-15', value: 110.1 },
    { observed_on: '2026-01-31', value: 120.2 },
    { observed_on: '2026-03-02', value: 150 },
    { observed_on: '2026-04-30', value: 5 },
    { observed_on: '2026-05-31', value: 25 },
  ])
  assert.equal(recap.months.length, 12)
  assert.deepEqual(recap.months[0], {
    month: '2026-01',
    value: 20.2,
    from: '2025-12-28',
    to: '2026-01-31',
    reset: false,
  })
  assert.deepEqual(recap.months[1], { month: '2026-02', value: null, from: null, to: null, reset: false })
  assert.equal(recap.months[2]!.value, 29.8)
  assert.equal(recap.months[2]!.from, '2026-01-31')
  assert.deepEqual(recap.months[3], {
    month: '2026-04',
    value: null,
    from: '2026-03-02',
    to: '2026-04-30',
    reset: true,
  })
  assert.equal(recap.months[4]!.value, 20)
  assert.equal(recap.total, 70)
  assert.equal(consumptionYear(2026, [{ observed_on: '2026-01-10', value: 3 }]).months[0]!.value, null)
})

test('variation mensuelle du stock avec stock en fin de mois', () => {
  const trend = movementYear(
    2026,
    4,
    [
      { month: '2026-01', kind: 'in', delta: 10 },
      { month: '2026-01', kind: 'out', delta: -3 },
      { month: '2026-03', kind: 'count', delta: -2 },
      { month: '2026-03', kind: 'out', delta: -1 },
    ],
    '2026-03-15',
  )
  assert.deepEqual(trend.months[0], { month: '2026-01', entries: 10, exits: 3, adjustments: 0, stock: 11 })
  assert.deepEqual(trend.months[1], { month: '2026-02', entries: 0, exits: 0, adjustments: 0, stock: 11 })
  assert.deepEqual(trend.months[2], { month: '2026-03', entries: 0, exits: 1, adjustments: -2, stock: 8 })
  assert.equal(trend.months[3]!.stock, null)
  assert.deepEqual([trend.entries, trend.exits, trend.adjustments], [10, 4, -2])
})
