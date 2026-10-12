import type { IconName, IconType } from '@astryxdesign/core/Icon'
import type { Me } from '../../src/domain/accounts.ts'

export type CommandIcon = IconType | IconName

export type CommandContext = {
  readonly me: Me
  readonly canOpen: (section: string) => boolean
}

export type CommandValues = Readonly<Record<string, string>>
export type CommandCheck = { readonly isValid: boolean; readonly text: string }

export type CommandField = {
  readonly id: string
  readonly label: string
  readonly isOptional?: boolean
  readonly describe?: (input: string, values: CommandValues) => CommandCheck
}

export type CommandForm = {
  readonly fields: readonly [CommandField, ...CommandField[]]
  readonly values?: CommandValues
  readonly submit: (values: CommandValues) => Promise<string>
}

type ActionBase = { readonly id: string; readonly title: string; readonly icon?: CommandIcon }
export type CommandAction = ActionBase &
  (
    | { readonly kind: 'open'; readonly href: string }
    | { readonly kind: 'push'; readonly view: CommandView }
    | { readonly kind: 'form'; readonly form: CommandForm }
    | { readonly kind: 'run'; readonly run: () => Promise<string> }
  )

export type CommandItem = {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly keywords?: readonly string[]
  readonly icon: CommandIcon
  readonly actions: readonly [CommandAction, ...CommandAction[]]
}

export type CommandGroup = { readonly title: string; readonly items: readonly CommandItem[] }

export type CommandView = {
  readonly id: string
  readonly kind: 'list' | 'actions' | 'form'
  readonly title: string
  readonly icon: CommandIcon
  readonly placeholder: string
  readonly search: (query: string) => Promise<readonly CommandGroup[]> | readonly CommandGroup[]
}

export type CommandPlugin = {
  readonly id: string
  readonly title: string
  readonly icon: CommandIcon
  readonly isAvailable: (context: CommandContext) => boolean
  readonly search: (query: string, context: CommandContext) => Promise<readonly CommandItem[]> | readonly CommandItem[]
  readonly suggestions?: (context: CommandContext) => readonly CommandItem[]
  readonly commands?: (context: CommandContext) => readonly CommandItem[]
  readonly fallbacks?: (query: string, context: CommandContext) => readonly CommandItem[]
  readonly scope?: { readonly keywords: readonly string[]; readonly placeholder: string }
}
