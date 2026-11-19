import type { TablePlugin } from '@astryxdesign/core/Table'

const interactive = 'a, button, input, select, textarea, label, [role="checkbox"], [role="menuitem"]'

export const rowLink = <T extends Record<string, unknown>>(href: (item: T) => string): TablePlugin<T> => ({
  transformBodyRow: (props, item) => ({
    ...props,
    htmlProps: {
      ...props.htmlProps,
      onClick: (event) => {
        props.htmlProps.onClick?.(event)
        const target = event.target as Element
        if (event.defaultPrevented || !event.currentTarget.contains(target) || target.closest(interactive)) return
        if (window.getSelection()?.toString()) return
        window.location.hash = href(item)
      },
    },
  }),
})
