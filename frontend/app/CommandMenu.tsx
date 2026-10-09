import { useEffect, useMemo, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createStaticSource } from '@astryxdesign/core/Typeahead'
import type { sections } from './sections.ts'

export function CommandMenu({ destinations }: { destinations: readonly (typeof sections)[number][] }) {
  const [isOpen, setIsOpen] = useState(false)
  const searchSource = useMemo(() => createStaticSource([...destinations]), [destinations])

  useEffect(() => {
    const openCommands = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', openCommands)
    return () => window.removeEventListener('keydown', openCommands)
  }, [])

  return (
    <>
      <Button
        label="Rechercher"
        icon={<Icon icon="search" />}
        variant="ghost"
        tooltip="Rechercher une rubrique (⌘K ou Ctrl+K)"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setIsOpen(true)}
      />
      <CommandPalette
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        searchSource={searchSource}
        label="Menu de commandes"
        input={<CommandPaletteInput label="Rechercher une rubrique" placeholder="Rechercher une rubrique…" />}
        emptySearchText="Aucune rubrique trouvée."
        renderItem={(item) => (
          <HStack gap={3} vAlign="center">
            <Icon icon={item.icon} />
            <Text>{item.label}</Text>
          </HStack>
        )}
        onValueChange={(id) => {
          if (destinations.some((item) => item.id === id)) window.location.hash = id
          setIsOpen(false)
        }}
      />
    </>
  )
}
