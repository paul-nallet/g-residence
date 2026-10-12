import { useCallback, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import {
  frequencyLabels,
  type VisitFrequency,
  type VisitTemplate,
  type VisitPointInput,
} from '../../src/domain/visits.ts'
import { today } from '../../src/domain/rules.ts'
import { useDetailCrumb } from '../app/crumb.ts'
import { PageLayout } from '../app/PageLayout.tsx'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { DateField, Feedback, Loading } from './shared.tsx'
import { startingPoints } from './TechnicalVisits.tsx'

const loadBuildings = () => call((c) => c.buildings.list())
const loadLocations = () => call((c) => c.technical.options())
export function VisitTemplateEditor({ id }: { id?: string }) {
  const load = useCallback(
    () => (id ? call((c) => c.visits.template({ params: { id } })) : Promise.resolve(null)),
    [id],
  )
  const result = useQuery('visit-template-edit:' + (id ?? 'new'), load)
  useDetailCrumb(id ? (result.data?.name ?? '') : 'Nouveau modèle')
  if (id && !result.data) return <Loading error={result.error} retry={() => void result.refresh()} />
  return <TemplateForm key={id ?? 'new'} model={result.data ?? undefined} />
}
function TemplateForm({ model }: { model?: VisitTemplate }) {
  const [name, setName] = useState(model?.name ?? ''),
    [building, setBuilding] = useState(model?.building_id ?? ''),
    [frequency, setFrequency] = useState<VisitFrequency>(model?.frequency ?? 'monthly'),
    [firstDue, setFirstDue] = useState(model?.first_due ?? today()),
    [archived, setArchived] = useState(model?.archived ?? false),
    [points, setPoints] = useState<(typeof VisitPointInput.Type)[]>(model ? [...model.points] : [...startingPoints])
  const buildings = useQuery('buildings', loadBuildings),
    locations = useQuery('technical-options', loadLocations),
    mutation = useMutation()
  const valid =
    !!name.trim() &&
    !!building &&
    (frequency === 'once' || !!firstDue) &&
    points.length > 0 &&
    points.every((p) => p.zone.trim() && p.label.trim())
  const save = () =>
    void mutation.run(async () => {
      const payload = {
        name,
        building_id: building,
        frequency,
        first_due: frequency === 'once' ? null : firstDue,
        archived,
        points,
      }
      await call((c) =>
        model ? c.visits.updateTemplate({ params: { id: model.id }, payload }) : c.visits.createTemplate({ payload }),
      )
      window.location.hash = '#visits/templates'
    })
  const setPoint = (index: number, patch: Partial<(typeof points)[number]>) =>
    setPoints(points.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={1}>
            <Heading level={1}>{model ? model.name : 'Nouveau modèle de visite'}</Heading>
            <Text color="secondary">Bâtiment, fréquence et points à contrôler lors des prochaines visites.</Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Annuler" href="#visits/templates" isDisabled={mutation.busy} />
            <Button
              label="Enregistrer le modèle"
              variant="primary"
              onClick={save}
              isDisabled={!valid || mutation.busy}
              isLoading={mutation.busy}
            />
          </HStack>
        </HStack>
      }
    >
      <Layout
        content={
          <LayoutContent>
            <VStack
              as="form"
              gap={6}
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                if (valid && !mutation.busy) save()
              }}
            >
              <Feedback error={mutation.error} />
              <Grid columns={{ minWidth: 320, max: 2 }} gap={6}>
                <VStack gap={1}>
                  <Heading level={2}>Organisation</Heading>
                  <Text color="secondary">
                    Le modèle reste facultatif. Les visites déjà créées conservent leur checklist.
                  </Text>
                </VStack>
                <VStack gap={4}>
                  <TextInput label="Nom du modèle" value={name} onChange={setName} isRequired />
                  <Selector
                    label="Bâtiment"
                    value={building}
                    onChange={(v) => setBuilding(v ?? '')}
                    isDisabled={!!model}
                    options={(buildings.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                  />
                  {buildings.error && <Feedback error={buildings.error} />}
                  {buildings.data?.length === 0 && <Text>Ajoutez d’abord un bâtiment depuis Lots et mouvements.</Text>}
                  <Selector
                    label="Fréquence"
                    value={frequency}
                    onChange={(v) => setFrequency(v as VisitFrequency)}
                    options={Object.entries(frequencyLabels).map(([value, label]) => ({ value, label }))}
                  />
                  {frequency !== 'once' && (
                    <DateField label="Première échéance" value={firstDue} onChange={setFirstDue} />
                  )}
                  {model && <CheckboxInput label="Archiver ce modèle" value={archived} onChange={setArchived} />}
                </VStack>
              </Grid>
              <Divider />
              <VStack gap={4}>
                <HStack hAlign="between" wrap="wrap" gap={3}>
                  <VStack gap={1}>
                    <Heading level={2}>Points à contrôler</Heading>
                    <Text color="secondary">
                      Organisez les points par zone, dans l’ordre de la tournée. {points.length}/50 points.
                    </Text>
                  </VStack>
                  <Button
                    label="Ajouter un point"
                    onClick={() =>
                      setPoints([...points, { zone: points.at(-1)?.zone ?? '', label: '', location: null }])
                    }
                    isDisabled={points.length >= 50}
                  />
                </HStack>
                {points.map((point, i) => (
                  <VStack key={i} gap={3}>
                    <Heading level={3}>Point {i + 1}</Heading>
                    <Grid columns={{ minWidth: 320, max: 2 }} gap={3}>
                      <TextInput
                        label={'Zone du point ' + (i + 1)}
                        value={point.zone}
                        onChange={(zone) => setPoint(i, { zone })}
                        isRequired
                      />
                      <TextInput
                        label={'Point ' + (i + 1) + ' à vérifier'}
                        value={point.label}
                        onChange={(label) => setPoint(i, { label })}
                        isRequired
                      />
                    </Grid>
                    <Selector
                      label={'Lieu du point ' + (i + 1)}
                      value={point.location ?? ''}
                      onChange={(v) => setPoint(i, { location: v || null })}
                      options={[
                        { value: '', label: 'Communs · zone précisée dans le constat' },
                        ...(locations.data?.locations ?? []).map((l) => ({
                          value: l.ref,
                          label: l.label + ' · ' + l.group,
                        })),
                      ]}
                    />
                    <HStack gap={2} wrap="wrap">
                      <Button
                        label={'Monter le point ' + (i + 1)}
                        size="sm"
                        isDisabled={i === 0}
                        onClick={() => {
                          const next = [...points]
                          ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
                          setPoints(next)
                        }}
                      />
                      <Button
                        label={'Retirer le point ' + (i + 1)}
                        size="sm"
                        variant="ghost"
                        onClick={() => setPoints(points.filter((_, j) => j !== i))}
                      />
                    </HStack>
                    <Divider />
                  </VStack>
                ))}
                {locations.error && <Feedback error={locations.error} />}
                <Button
                  label="Enregistrer le modèle"
                  type="submit"
                  variant="primary"
                  isDisabled={!valid || mutation.busy}
                  isLoading={mutation.busy}
                />
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </PageLayout>
  )
}
