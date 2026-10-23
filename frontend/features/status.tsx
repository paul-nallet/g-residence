import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

export const roleLabels = { admin: 'Administrateur', manager: 'Gestionnaire', cleaner: 'Ménage' }
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && <Banner status="error" role="alert" title={error} />}
      {success && (
        <Text as="p" role="status">
          {success}
        </Text>
      )}
    </>
  )
}
export function Loading({ error, retry }: { error: string; retry: () => void }) {
  return (
    <VStack gap={3}>
      {error ? (
        <>
          <Feedback error={error} />
          <Button label="Réessayer" onClick={retry} />
        </>
      ) : (
        <Text as="p" role="status">
          Chargement…
        </Text>
      )}
    </VStack>
  )
}
