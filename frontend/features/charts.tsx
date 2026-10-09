import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { LegendPayload, TooltipPayloadEntry } from 'recharts'

export const chartColors = {
  teal: 'var(--color-data-categorical-teal)',
  orange: 'var(--color-data-categorical-orange)',
  blue: 'var(--color-data-categorical-blue)',
  muted: 'var(--color-data-gray-3)',
}

const tick = { fill: 'var(--color-text-secondary)', style: { fontSize: 'var(--font-size-sm)' } }
export const chartMargin = { top: 8, right: 4, bottom: 0, left: 4 }
export const gridProps = { vertical: false, stroke: 'var(--color-border)', strokeOpacity: 0.6 }
export const xAxisProps = { tick, tickLine: false, axisLine: false, tickMargin: 8 }
export const yAxisProps = { tick, tickLine: false, axisLine: false, tickMargin: 8, width: 'auto' as const }
export const coloredTick = (color: string) => ({ ...tick, fill: color })
export const barRadius: [number, number, number, number] = [4, 4, 0, 0]
export const negativeBarRadius: [number, number, number, number] = [0, 0, 4, 4]
export const lineProps = { type: 'monotone' as const, strokeWidth: 2, dot: false, activeDot: { r: 4 } }
export const tooltipProps = {
  cursor: { fill: 'var(--color-background-muted)' },
  wrapperStyle: { outline: 'none', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-container)' },
}
export const legendProps = { wrapperStyle: { paddingTop: 'var(--spacing-3)' } }

export const shortMonth = (period: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(period + '-01'))

function Swatch({ color }: { color: string | undefined }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" style={{ width: 'var(--spacing-2)', flexShrink: 0 }}>
      <rect width="10" height="10" rx="2" fill={color} />
    </svg>
  )
}

type Row = Record<string, unknown>

type TooltipRow = { key: string; color: string | undefined; label: ReactNode; value: ReactNode }

export function chartTooltip<T extends Row>(
  title: (row: T) => ReactNode,
  value: (value: unknown, entry: TooltipPayloadEntry) => ReactNode,
  extra: (row: T) => ReadonlyArray<TooltipRow> = () => [],
) {
  return function ChartTooltip({
    active,
    payload,
  }: {
    active?: boolean
    payload?: ReadonlyArray<TooltipPayloadEntry>
  }) {
    if (!active || !payload?.length) return null
    const row = payload[0]!.payload as T
    const rows: TooltipRow[] = [
      ...payload.map((entry) => ({
        key: String(entry.dataKey),
        color: entry.color,
        label: entry.name,
        value: value(entry.value, entry),
      })),
      ...extra(row),
    ]
    return (
      <Card padding={2}>
        <VStack gap={1.5}>
          <Text size="sm" weight="medium">
            {title(row)}
          </Text>
          {rows.map((item) => (
            <HStack key={item.key} gap={4} hAlign="between" vAlign="center">
              <HStack gap={1.5} vAlign="center">
                <Swatch color={item.color} />
                <Text size="sm" color="secondary">
                  {item.label}
                </Text>
              </HStack>
              <Text size="sm" weight="medium" hasTabularNumbers>
                {item.value}
              </Text>
            </HStack>
          ))}
        </VStack>
      </Card>
    )
  }
}

export function ChartLegend({ payload }: { payload?: ReadonlyArray<LegendPayload> }) {
  return (
    <HStack gap={4} hAlign="center" wrap="wrap">
      {payload?.map((entry) => (
        <HStack key={String(entry.value)} gap={1.5} vAlign="center">
          <Swatch color={entry.color} />
          <Text size="sm" color="secondary">
            {entry.value}
          </Text>
        </HStack>
      ))}
    </HStack>
  )
}
