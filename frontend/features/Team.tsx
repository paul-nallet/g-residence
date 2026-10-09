import { PageLayout } from '../app/PageLayout.tsx'
import { useCallback, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import type { Me, Role } from '../../src/domain/accounts.ts'
import { call } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { dateLabel, Editor, Feedback, Loading, RoleField, roleLabels } from './shared.tsx'

function InviteEditor({ close, saved }: { close: () => void; saved: (token: string) => void }) {
  const [email, setEmail] = useState(''),
    [role, setRole] = useState<Role>('manager'),
    mutation = useMutation()
  const submit = () =>
    mutation.run(async () => {
      const result = await call((client) => client.team.invite({ payload: { email, role } }))
      saved(result.token)
    })
  return (
    <Editor
      title="Inviter une personne"
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
      label="Créer le lien d’invitation"
    >
      <TextInput label="Email de la personne" value={email} onChange={setEmail} type="email" isRequired />
      <RoleField value={role} onChange={setRole} />
      <Text>Le lien est valable 7 jours et utilisable une seule fois. Aucun email n’est envoyé automatiquement.</Text>
    </Editor>
  )
}
function MemberEditor({
  member,
  close,
  saved,
}: {
  member: { id: string; name: string; role: Role; disabled: number }
  close: () => void
  saved: () => void
}) {
  const [role, setRole] = useState(member.role),
    [disabled, setDisabled] = useState(!!member.disabled),
    mutation = useMutation()
  const submit = () =>
    mutation.run(
      () => call((client) => client.team.member({ params: { id: member.id }, payload: { role, disabled } })),
      saved,
    )
  return (
    <Editor
      title={'Accès de ' + member.name}
      close={close}
      submit={() => void submit()}
      busy={mutation.busy}
      error={mutation.error}
    >
      <RoleField value={role} onChange={setRole} />
      <Button
        label={disabled ? 'Réactiver le compte' : 'Désactiver le compte'}
        onClick={() => setDisabled((value) => !value)}
      />
      <Text>
        {disabled ? 'Le compte sera désactivé.' : 'Le compte restera actif.'} Les sessions existantes seront révoquées à
        l’enregistrement.
      </Text>
    </Editor>
  )
}
export function Team({ me }: { me: Me }) {
  const load = useCallback(() => call((client) => client.team.list()), []),
    result = useQuery('team', load),
    mutation = useMutation()
  const [invite, setInvite] = useState(false),
    [link, setLink] = useState(''),
    [copy, setCopy] = useState(''),
    [member, setMember] = useState<{ id: string; name: string; role: Role; disabled: number } | null>(null),
    [revoke, setRevoke] = useState<string | null>(null)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopy('Lien copié.')
    } catch {
      setCopy('Sélectionnez le lien ci-dessus pour le copier manuellement.')
    }
  }
  return (
    <PageLayout
      header={
        <HStack gap={3} wrap="wrap" hAlign="between">
          <VStack gap={2}>
            <Heading level={1}>Équipe</Heading>
            <Text color="secondary">Comptes et accès à {me.residenceName}.</Text>
          </VStack>
          <Button label="Inviter une personne" variant="primary" onClick={() => setInvite(true)} />
        </HStack>
      }
    >
      <Feedback error={mutation.error} success={mutation.success} />
      {link && (
        <VStack gap={3}>
          <TextInput label="Lien d’invitation à transmettre" value={link} isReadOnly />
          <Button label="Copier le lien" onClick={() => void copyLink()} />
          {copy && (
            <Text as="p" role="status">
              {copy}
            </Text>
          )}
          <Text type="supporting">
            Ce lien ne sera affiché qu’ici. Vous pouvez révoquer l’invitation et en créer une nouvelle si vous le
            perdez.
          </Text>
        </VStack>
      )}
      {!result.data ? (
        <Loading error={result.error} retry={() => void result.refresh()} />
      ) : (
        <>
          <List hasDividers header={<Heading level={2}>Membres</Heading>}>
            {result.data.members.map((person) => (
              <ListItem
                key={person.id}
                label={person.name}
                description={person.email + ' · ' + roleLabels[person.role]}
                endContent={
                  <HStack gap={2}>
                    {!!person.disabled && <Token label="Désactivé" color="gray" />}
                    {person.id === me.id ? (
                      <Text type="supporting">Votre compte</Text>
                    ) : (
                      <Button label="Gérer l’accès" onClick={() => setMember(person)} />
                    )}
                  </HStack>
                }
              />
            ))}
          </List>
          <List hasDividers header={<Heading level={2}>Invitations en attente</Heading>}>
            {result.data.invitations.length ? (
              result.data.invitations.map((item) => (
                <ListItem
                  key={item.id}
                  label={item.email}
                  description={roleLabels[item.role] + ' · expire le ' + dateLabel(item.expires_at.slice(0, 10))}
                  endContent={<Button label="Révoquer" onClick={() => setRevoke(item.id)} />}
                />
              ))
            ) : (
              <ListItem label="Aucune invitation en attente." />
            )}
          </List>
        </>
      )}
      {invite && (
        <InviteEditor
          close={() => setInvite(false)}
          saved={(token) => {
            setLink(window.location.origin + '/?invite=' + encodeURIComponent(token))
            setCopy('')
            setInvite(false)
            void result.refresh()
          }}
        />
      )}
      {member && (
        <MemberEditor
          member={member}
          close={() => setMember(null)}
          saved={() => {
            setMember(null)
            void result.refresh()
          }}
        />
      )}
      {revoke && (
        <Editor
          title="Révoquer l’invitation"
          close={() => setRevoke(null)}
          busy={mutation.busy}
          error={mutation.error}
          label="Révoquer"
          submit={() =>
            void mutation.run(
              () => call((client) => client.team.revoke({ params: { id: revoke } })),
              () => {
                setRevoke(null)
                setLink('')
                void result.refresh()
              },
            )
          }
        >
          <Text>Le lien de cette invitation ne permettra plus de créer un compte.</Text>
        </Editor>
      )}
    </PageLayout>
  )
}
