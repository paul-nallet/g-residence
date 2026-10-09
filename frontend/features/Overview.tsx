import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback } from 'react'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { Me } from '../../src/domain/accounts.ts'
import { addDays, today } from '../../src/domain/rules.ts'
import { call } from '../lib/api.ts'
import { useQuery } from '../lib/data.ts'
import { CommentIcon, taskComments } from './Cleaning.tsx'
import { dateLabel, EventList, Loading, StateToken } from './shared.tsx'

export function Overview({ me }: { me: Me }) {
  const date = today(),
    manager = me.role !== 'cleaner',
    load = useCallback(async () => {
      const [lots, occupied, events, cleaning, stock, meters] = await Promise.all([
        call((client) => client.lots.list({ query: {} })),
        call((client) => client.lots.list({ query: { state: 'occupied' } })),
        call((client) => client.calendar.list({ query: { from: date, to: addDays(date, 6) } })),
        call((client) => client.cleaning.tasks({ query: { from: date, to: date } })),
        manager ? call((client) => client.stock.list({ query: { level: 'alert' } })) : null,
        manager ? call((client) => client.meters.list({ query: { month: date.slice(0, 7), pending: 'true' } })) : null,
      ])
      return { lots, occupied, events, cleaning, stock, meters }
    }, [date, manager]),
    result = useQuery('overview:' + date, load)
  return (
    <PageLayout
      header={
        <VStack gap={2}>
          <Heading level={1}>{me.residenceName}</Heading>
          <Text color="secondary">Le quotidien de la résidence · Bonjour {me.name}.</Text>
        </VStack>
      }
    >
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <List hasDividers header={<Heading level={2}>La résidence</Heading>}>
            <ListItem
              label={`${result.data.lots.total} lots actifs`}
              description={`${result.data.occupied.total} lots occupés selon les entrées et sorties confirmées.`}
              href="#lots"
            />
            <ListItem label="Planning" description="Consulter les mouvements et états des lieux." href="#calendar" />
            {manager && (
              <ListItem
                label="Bilan de la semaine"
                description="Préparer un tableau à copier dans Excel."
                href="#reports"
              />
            )}
          </List>
          <List hasDividers header={<Heading level={2}>{manager ? 'Ménage du jour' : 'Mes ménages du jour'}</Heading>}>
            {result.data.cleaning.map((task) => (
              <ListItem
                key={task.id}
                label={'Lot ' + task.lot_number + (task.building_name ? ' · ' + task.building_name : '')}
                description={
                  (manager ? task.agent_name + ' · ' : '') +
                  (task.total ? task.handled + '/' + task.total + ' points traités' : 'Sans checklist')
                }
                href={'#cleaning/' + task.id}
                endContent={
                  <HStack gap={2} vAlign="center">
                    <CommentIcon comments={taskComments(task)} />
                    <StateToken state={task.status} />
                  </HStack>
                }
              />
            ))}
            {result.data.cleaning.length === 0 && <ListItem label="Aucun ménage prévu aujourd’hui" href="#cleaning" />}
          </List>
          {result.data.stock && (
            <List hasDividers header={<Heading level={2}>Stocks à réapprovisionner</Heading>}>
              {result.data.stock.items.slice(0, 5).map((item) => (
                <ListItem
                  key={item.id}
                  label={item.name}
                  description={`${item.quantity.toLocaleString('fr-FR')}${item.unit ? ' ' + item.unit : ''} en stock · seuil ${item.threshold}`}
                  href={'#stock/' + item.id}
                  endContent={
                    item.level === 'out' ? (
                      <Token label="Rupture" color="red" size="sm" />
                    ) : (
                      <Token label="Stock faible" color="orange" size="sm" />
                    )
                  }
                />
              ))}
              {result.data.stock.total === 0 ? (
                <ListItem
                  label="Aucun article à réapprovisionner"
                  description="Toutes les quantités dépassent leur seuil d’alerte."
                />
              ) : (
                result.data.stock.total > 5 && (
                  <ListItem label={`Voir les ${result.data.stock.total} articles`} href="#stock" />
                )
              )}
            </List>
          )}
          {result.data.meters && (
            <List hasDividers header={<Heading level={2}>Relevés de compteurs à faire ce mois-ci</Heading>}>
              {result.data.meters.items.slice(0, 5).map((meter) => (
                <ListItem
                  key={meter.id}
                  label={meter.name}
                  description={
                    meter.location +
                    ' · ' +
                    (meter.latest_date ? 'Dernier relevé le ' + dateLabel(meter.latest_date) : 'Aucun relevé')
                  }
                  href={'#meters/' + meter.id}
                  endContent={<Token label="À relever" color="orange" size="sm" />}
                />
              ))}
              {result.data.meters.total === 0 ? (
                <ListItem
                  label="Tous les compteurs sont relevés"
                  description="Un index a été saisi ce mois-ci pour chaque compteur."
                />
              ) : (
                result.data.meters.total > 5 && (
                  <ListItem label={`Voir les ${result.data.meters.total} compteurs`} href="#meters" />
                )
              )}
            </List>
          )}
          <EventList events={result.data.events} title="Les sept prochains jours" />
        </>
      )}
    </PageLayout>
  )
}
