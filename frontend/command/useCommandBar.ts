import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SearchSource } from '@astryxdesign/core/Typeahead'
import { messageOf } from '../lib/api.ts'
import { checkForChanges } from '../lib/sync.ts'
import { expand, secondaryView } from './engine.ts'
import type { CommandAction, CommandItem, CommandView } from './types.ts'

export type CommandRow = { id: string; label: string; auxiliaryData: { group: string; item: CommandItem } }
export type CommandFrame = { readonly view: CommandView; readonly query: string }
export type CommandNotice = { readonly tone: 'success' | 'error'; readonly text: string } | null

const anchored = (frames: readonly CommandFrame[], root: CommandView): readonly [CommandFrame, ...CommandFrame[]] => {
  const [first, ...rest] = frames
  return first?.view === root ? [first, ...rest] : [{ view: root, query: '' }]
}

export function useCommandBar(root: CommandView) {
  const [frames, setFrames] = useState<readonly CommandFrame[]>([{ view: root, query: '' }])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<CommandNotice>(null)
  const stack = useMemo(() => anchored(frames, root), [frames, root])
  const top = stack.at(-1) ?? stack[0]
  const topRef = useRef(top)
  useLayoutEffect(() => {
    topRef.current = top
  }, [top])
  const rows = useRef(new Map<string, CommandItem>())

  const source = useMemo<SearchSource<CommandRow>>(() => {
    const load = async (query: string) => {
      const { view } = topRef.current
      try {
        const groups = await view.search(query)
        return groups.flatMap((group) =>
          group.items.map((item) => {
            const id = view.id + '|' + group.title + '|' + item.id
            rows.current.set(id, item)
            return { id, label: item.title, auxiliaryData: { group: group.title, item } }
          }),
        )
      } catch (error) {
        setNotice({ tone: 'error', text: messageOf(error) })
        return []
      }
    }
    return { search: load, bootstrap: () => load('') }
  }, [])

  const push = useCallback(
    (view: CommandView, query: string) => {
      setNotice(null)
      setFrames((current) => {
        const base = anchored(current, root)
        return [...base.slice(0, -1), { view: base.at(-1)?.view ?? root, query }, { view, query: '' }]
      })
    },
    [root],
  )
  const pop = useCallback(() => {
    setNotice(null)
    setFrames((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }, [])
  const popToList = useCallback(
    () =>
      setFrames((current) => {
        const index = current.findLastIndex((frame) => frame.view.kind === 'list')
        return current.slice(0, Math.max(index, 0) + 1)
      }),
    [],
  )
  const reset = useCallback(() => {
    setFrames([{ view: root, query: '' }])
    setNotice(null)
    rows.current.clear()
  }, [root])

  const perform = useCallback(
    async (item: CommandItem, action: CommandAction, query: string) => {
      const step = expand(item, action)
      if (step.kind === 'open') window.location.hash = step.href.replace(/^#/, '')
      else if (step.kind === 'push') push(step.view, query)
      else if (step.kind === 'run') {
        setBusy(true)
        setNotice(null)
        try {
          setNotice({ tone: 'success', text: await step.run() })
          popToList()
          void checkForChanges()
        } catch (error) {
          setNotice({ tone: 'error', text: messageOf(error) })
        } finally {
          setBusy(false)
        }
      }
    },
    [push, popToList],
  )

  return {
    top,
    trail: stack
      .slice(1)
      .map((frame) => frame.view.title)
      .filter((title, index, titles) => title !== titles[index - 1]),
    busy,
    notice,
    source,
    itemOf: (id: string | undefined) => (id === undefined ? undefined : rows.current.get(id)),
    activate: (item: CommandItem, query: string) => {
      if (!busy) void perform(item, item.actions[0], query)
    },
    showSecondary: (item: CommandItem, query: string) => {
      const view = secondaryView(item)
      if (view) push(view, query)
      return view !== null
    },
    pop,
    reset,
    canPop: stack.length > 1,
  }
}
export type CommandBarState = ReturnType<typeof useCommandBar>
