import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  actionsView,
  expand,
  matches,
  formView,
  resolveScope,
  rootView,
  secondaryView,
} from '../frontend/command/engine.ts'
import type { CommandContext, CommandForm, CommandItem, CommandPlugin } from '../frontend/command/types.ts'

const context: CommandContext = {
  me: { id: 'u', name: 'Test', email: 'test@example.test', role: 'admin', residenceId: 'r', residenceName: 'R' },
  canOpen: (section) => section !== 'team',
}
const item = (id: string, title: string): CommandItem => ({
  id,
  title,
  icon: 'search',
  actions: [{ kind: 'open', id: 'open', title: 'Ouvrir', href: '#x/' + id }],
})
const plugin = (id: string, titles: readonly string[], extra: Partial<CommandPlugin> = {}): CommandPlugin => ({
  id,
  title: id,
  icon: 'search',
  isAvailable: () => true,
  search: (query) => titles.filter((title) => matches(query, title)).map((title) => item(title, title)),
  ...extra,
})
const stock = plugin('Stocks', ['Café', 'Couette'], {
  scope: { keywords: ['stocks', 'articles'], placeholder: 'Article…' },
})
const lots = plugin('Lots', ['Lot 101', 'Lot 205'], { scope: { keywords: ['lots'], placeholder: 'Lot…' } })
const titles = async (groups: Awaited<ReturnType<ReturnType<typeof rootView>['search']>>) =>
  groups.map((group) => [group.title, group.items.map((entry) => entry.title)])

describe('barre d’actions', () => {
  test('ignore accents et casse', () => {
    assert.equal(matches('cafe', 'Café'), true)
    assert.equal(matches('CAF cou', 'Café couette'), true)
    assert.equal(matches('the', 'Café'), false)
  })

  test('résout une portée par préfixe de mot-clé', () => {
    assert.deepEqual(resolveScope('stock cafe', [stock, lots]), { plugin: stock, rest: 'cafe' })
    assert.deepEqual(resolveScope('arti', [stock, lots]), { plugin: stock, rest: '' })
    assert.equal(resolveScope('st cafe', [stock, lots]), null)
    assert.equal(resolveScope('cafe', [stock, lots]), null)
  })

  test('recherche globale groupée par plugin et limitée aux plugins disponibles', async () => {
    const hidden = plugin('Équipe', ['Café admin'], { isAvailable: (ctx) => ctx.canOpen('team') })
    const view = rootView([stock, lots, hidden], context)
    assert.deepEqual(await titles(await view.search('cafe')), [['Stocks', ['Café']]])
    assert.deepEqual(await titles(await view.search('stock cafe')), [['Stocks', ['Café']]])
    assert.deepEqual(await titles(await view.search('lots')), [['Lots', ['Lots', 'Lot 101', 'Lot 205']]])
    assert.deepEqual(await titles(await view.search('')), [['Rechercher dans', ['Stocks', 'Lots']]])
  })

  test('un plugin en échec ne bloque pas les autres', async () => {
    const broken = plugin('Panne', [], {
      search: () => Promise.reject(new Error('indisponible')),
    })
    assert.deepEqual(await titles(await rootView([broken, stock], context).search('cafe')), [['Stocks', ['Café']]])
  })

  test('entrer dans une portée puis rechercher', async () => {
    const [group] = await rootView([stock], context).search('')
    const scope = group?.items[0]
    assert.ok(scope)
    const view = secondaryView(scope)
    assert.ok(view)
    assert.deepEqual(await titles(await view.search('cou')), [['Stocks', ['Couette']]])
  })

  test('actions secondaires et formulaire à une étape', async () => {
    const submitted: unknown[] = []
    const form: CommandForm = {
      fields: [
        {
          id: 'quantity',
          label: 'Quantité',
          describe: (input) =>
            /^\d+$/.test(input) ? { isValid: true, text: '5 → ' + input } : { isValid: false, text: 'Nombre entier.' },
        },
      ],
      submit: async (values) => {
        submitted.push(values)
        return 'Fait.'
      },
    }
    const coffee: CommandItem = {
      ...item('cafe', 'Café'),
      actions: [
        { kind: 'open', id: 'open', title: 'Ouvrir la fiche', href: '#stock/cafe' },
        { kind: 'form', id: 'out', title: 'Enregistrer une sortie', form },
      ],
    }
    assert.equal(secondaryView(item('a', 'A')), null)
    const [actions] = await actionsView(coffee).search('sortie')
    assert.equal(actions?.items[0]?.title, 'Enregistrer une sortie')
    assert.equal(actions?.items[0]?.actions[0].kind, 'push')
    assert.equal(expand(coffee, coffee.actions[1] ?? coffee.actions[0]).kind, 'push')

    const view = formView(coffee, coffee.actions[1] ?? coffee.actions[0], form)
    const [invalid] = await view.search('abc')
    const reject = invalid?.items[0]?.actions[0]
    assert.equal(invalid?.items[0]?.subtitle, 'Nombre entier.')
    assert.ok(reject?.kind === 'run')
    await assert.rejects(reject.run(), /Nombre entier/)
    const [valid] = await view.search(' 2 ')
    const accept = valid?.items[0]?.actions[0]
    assert.ok(accept?.kind === 'run')
    assert.equal(await accept.run(), 'Fait.')
    assert.deepEqual(submitted, [{ quantity: '2' }])
  })

  test('formulaire en plusieurs étapes, valeurs préremplies et champs facultatifs', async () => {
    const submitted: unknown[] = []
    const form: CommandForm = {
      values: { name: 'Thé' },
      fields: [
        { id: 'name', label: 'Nom' },
        { id: 'unit', label: 'Unité', isOptional: true },
        { id: 'note', label: 'Note' },
      ],
      submit: async (values) => {
        submitted.push(values)
        return 'Créé.'
      },
    }
    const create: CommandItem = {
      ...item('create', 'Créer'),
      actions: [{ kind: 'form', id: 'create', title: 'Créer', form }],
    }
    const first = formView(create, create.actions[0], form)
    assert.equal(first.placeholder, 'Unité')
    assert.equal(first.title, 'Créer')
    const [skip] = await first.search('')
    assert.equal(skip?.title, 'Créer · Créer (2/3)')
    const next = skip?.items[0]?.actions[0]
    assert.ok(next?.kind === 'push')
    assert.equal(next.view.title, 'Créer')
    const [required] = await next.view.search('')
    assert.equal(required?.items[0]?.subtitle, 'Note : valeur obligatoire.')
    const [done] = await next.view.search('vrac')
    const submit = done?.items[0]?.actions[0]
    assert.ok(submit?.kind === 'run')
    assert.equal(await submit.run(), 'Créé.')
    assert.deepEqual(submitted, [{ name: 'Thé', unit: '', note: 'vrac' }])
  })

  test('commandes et repli dans une portée', async () => {
    const command = { ...item('create', 'Créer un article'), keywords: ['ajouter'] }
    const withCommands = {
      ...stock,
      commands: () => [command],
      fallbacks: (query: string) => [item('new', 'Créer « ' + query + ' »')],
    }
    const root = rootView([withCommands], context)
    assert.deepEqual(await titles(await root.search('')), [
      ['Rechercher dans', ['Stocks']],
      ['Commandes', ['Créer un article']],
    ])
    assert.deepEqual(await titles(await root.search('ajouter')), [['Stocks', ['Créer un article']]])
    assert.deepEqual(await titles(await root.search('stock the')), [['Stocks', ['Créer « the »']]])
    assert.deepEqual(await titles(await root.search('cafe')), [['Stocks', ['Café']]])
    assert.deepEqual(await titles(await root.search('stock cafe')), [['Stocks', ['Café']]])
    assert.deepEqual(await titles(await root.search('stock caf')), [['Stocks', ['Café', 'Créer « caf »']]])
  })
})
