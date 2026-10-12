import type { CommandPlugin } from '../types.ts'
import { lotsPlugin } from './lots.ts'
import { navigationPlugin } from './navigation.ts'
import { stockPlugin } from './stock.ts'

export const plugins: readonly CommandPlugin[] = [navigationPlugin, stockPlugin, lotsPlugin]
