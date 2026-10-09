import { useCallback, useState } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { Feedback, Loading, roleLabels } from './shared.tsx'

export function Auth({
  setup,
  allowed,
  invite,
  onConnected,
}: {
  setup: boolean
  allowed: boolean
  invite: string
  onConnected: () => void
}) {
  const [name, setName] = useState(''),
    [residenceName, setResidenceName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('')
  const mutation = useMutation()
  const load = useCallback(
    () => (invite ? call((client) => client.auth.preview({ params: { id: invite } })) : Promise.resolve(null)),
    [invite],
  )
  const preview = useQuery('invite:' + invite, load)
  const submit = () =>
    mutation.run(
      () =>
        invite
          ? call((client) => client.auth.accept({ params: { id: invite }, payload: { name, password } }))
          : setup
            ? call((client) => client.auth.setup({ payload: { name, residenceName, email, password } }))
            : call((client) => client.auth.login({ payload: { email, password } })),
      onConnected,
    )
  return (
    <Center axis="both" padding={6} style={{ minHeight: '100dvh', backgroundColor: 'var(--color-background-body)' }}>
      <VStack gap={4} hAlign="center" style={{ width: '100%', maxWidth: 400 }}>
        <Heading level={1}>GResidence</Heading>
        <Text>Gestion de résidence étudiante</Text>
        <Card padding={8} width="100%">
          <VStack gap={4}>
            <Heading level={2}>
              {invite ? 'Rejoindre la résidence' : setup ? 'Créer votre résidence' : 'Se connecter'}
            </Heading>
            {invite && !preview.data ? (
              <Loading error={preview.error} retry={() => void preview.refresh()} />
            ) : setup && !allowed ? (
              <Text>L’installation est verrouillée. Configurez l’email administrateur côté serveur.</Text>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                <VStack gap={4}>
                  {preview.data && (
                    <Text>
                      {preview.data.residenceName} · {roleLabels[preview.data.role]} · {preview.data.email}
                    </Text>
                  )}
                  {setup && !invite && (
                    <TextInput
                      label="Nom de la résidence"
                      value={residenceName}
                      onChange={setResidenceName}
                      isRequired
                    />
                  )}
                  {(setup || invite) && (
                    <TextInput label="Votre nom" value={name} onChange={setName} isRequired autoComplete="name" />
                  )}
                  {!invite && (
                    <TextInput
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      type="email"
                      isRequired
                      autoComplete="username"
                    />
                  )}
                  <TextInput
                    label="Mot de passe"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    autoComplete={setup || invite ? 'new-password' : 'current-password'}
                    description={setup || invite ? '12 caractères minimum.' : undefined}
                    isRequired
                  />
                  <Feedback error={mutation.error} />
                  <Button
                    label={invite ? 'Activer mon compte' : setup ? 'Créer la résidence' : 'Se connecter'}
                    variant="primary"
                    type="submit"
                    isLoading={mutation.busy}
                    isDisabled={mutation.busy}
                  />
                </VStack>
              </form>
            )}
            {invite && <Button label="Retour à la connexion" href="/" variant="ghost" />}
          </VStack>
        </Card>
      </VStack>
    </Center>
  )
}
