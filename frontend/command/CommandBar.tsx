import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import {
  CommandPalette,
  CommandPaletteFooter,
  CommandPaletteInput,
  useCommandPaletteContext,
  type CommandPaletteContextValue,
} from '@astryxdesign/core/CommandPalette'
import { Icon } from '@astryxdesign/core/Icon'
import { Kbd } from '@astryxdesign/core/Kbd'
import { HStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { Me } from '../../src/domain/accounts.ts'
import { rootView, secondaryView } from './engine.ts'
import { plugins } from './plugins/index.ts'
import type { CommandContext } from './types.ts'
import { useCommandBar, type CommandBarState, type CommandRow } from './useCommandBar.ts'

const isOpenShortcut = (event: {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
}) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k'

const highlighted = (palette: CommandPaletteContextValue, bar: CommandBarState) =>
  bar.itemOf(palette.selectableItems[Math.max(palette.highlightedIndex, 0)]?.value)

function CommandBarInput({ bar }: { bar: CommandBarState }) {
  const palette = useCommandPaletteContext()
  const synced = useRef(bar.top)
  useEffect(() => {
    if (!palette || synced.current === bar.top) return
    synced.current = bar.top
    palette.setSearch(bar.top.query)
  }, [palette, bar.top])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!palette || event.nativeEvent.isComposing) return
    const item = highlighted(palette, bar)
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!item) return
      bar.activate(item, palette.search)
      if (item.actions[0].kind === 'open') palette.onClose()
    } else if ((event.key === 'Tab' && !event.shiftKey) || isOpenShortcut(event)) {
      event.preventDefault()
      if (item) bar.showSecondary(item, palette.search)
    } else if (
      bar.canPop &&
      (event.key === 'Escape' ||
        (event.key === 'Tab' && event.shiftKey) ||
        (event.key === 'Backspace' && !palette.search))
    ) {
      event.preventDefault()
      event.stopPropagation()
      bar.pop()
    }
  }

  return (
    <CommandPaletteInput
      label={bar.top.view.placeholder}
      placeholder={bar.top.view.placeholder}
      onKeyDown={onKeyDown}
      endContent={
        bar.trail.length > 0 ? (
          <Token size="sm" label={bar.trail.join(' › ')} icon={<Icon icon={bar.top.view.icon} />} onRemove={bar.pop} />
        ) : null
      }
    />
  )
}

function CommandBarFooter({ bar }: { bar: CommandBarState }) {
  const palette = useCommandPaletteContext()
  const item = palette ? highlighted(palette, bar) : undefined
  return (
    <CommandPaletteFooter>
      {bar.busy ? (
        <Text role="status">Enregistrement…</Text>
      ) : bar.notice ? (
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={bar.notice.tone}
            label={bar.notice.tone === 'success' ? 'Action effectuée' : 'Action impossible'}
          />
          <Text role={bar.notice.tone === 'success' ? 'status' : 'alert'}>{bar.notice.text}</Text>
        </HStack>
      ) : (
        <HStack gap={4} vAlign="center">
          {item ? (
            <HStack gap={2} vAlign="center">
              <Kbd keys="enter" />
              <Text color="secondary">{item.actions[0].title}</Text>
            </HStack>
          ) : null}
          {item && secondaryView(item) ? (
            <HStack gap={2} vAlign="center">
              <Kbd keys="tab" />
              <Text color="secondary">{item.actions[0].kind === 'push' ? 'Entrer' : 'Actions'}</Text>
            </HStack>
          ) : null}
          <HStack gap={2} vAlign="center">
            <Kbd keys="esc" />
            <Text color="secondary">{bar.canPop ? 'Retour' : 'Fermer'}</Text>
          </HStack>
        </HStack>
      )}
    </CommandPaletteFooter>
  )
}

export function CommandBar({ me, destinations }: { me: Me; destinations: readonly { id: string }[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const keepOpen = useRef(false)
  const allowed = destinations.map((section) => section.id).join(' ')
  const root = useMemo(() => {
    const ids = new Set(allowed.split(' '))
    const context: CommandContext = { me, canOpen: (section) => ids.has(section) }
    return rootView(plugins, context)
  }, [me, allowed])
  const bar = useCommandBar(root)

  useEffect(() => {
    const open = (event: globalThis.KeyboardEvent) => {
      if (isOpenShortcut(event) && !isOpen) {
        event.preventDefault()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', open)
    return () => window.removeEventListener('keydown', open)
  }, [isOpen])

  return (
    <>
      <Button
        label="Rechercher"
        icon={<Icon icon="search" />}
        variant="ghost"
        tooltip="Rechercher ou agir (⌘K ou Ctrl+K)"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setIsOpen(true)}
      />
      <CommandPalette<CommandRow>
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (open) setIsOpen(true)
          else if (keepOpen.current) keepOpen.current = false
          else {
            setIsOpen(false)
            bar.reset()
          }
        }}
        searchSource={bar.source}
        label="Barre d’actions"
        input={<CommandBarInput bar={bar} />}
        footer={<CommandBarFooter bar={bar} />}
        emptySearchText="Aucun résultat."
        renderItem={(row) => (
          <HStack gap={3} vAlign="center">
            <Icon icon={row.auxiliaryData.item.icon} />
            <Text>{row.auxiliaryData.item.title}</Text>
            {row.auxiliaryData.item.subtitle ? (
              <Text color="secondary" maxLines={1}>
                {row.auxiliaryData.item.subtitle}
              </Text>
            ) : null}
          </HStack>
        )}
        onValueChange={(id) => {
          const item = bar.itemOf(id)
          if (!item) return
          keepOpen.current = item.actions[0].kind !== 'open'
          bar.activate(item, '')
        }}
      />
    </>
  )
}
