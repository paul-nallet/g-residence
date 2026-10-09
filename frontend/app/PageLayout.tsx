import type { ReactNode } from 'react'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/Stack'

export function PageLayout({
  header,
  navigation,
  children,
}: {
  header: ReactNode
  navigation?: ReactNode
  children: ReactNode
}) {
  return (
    <Layout
      height="fill"
      padding={4}
      header={
        <LayoutHeader hasDivider paddingBlockEnd={navigation ? 0 : undefined}>
          <VStack gap={3}>
            {header}
            {navigation}
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <VStack gap={5}>{children}</VStack>
        </LayoutContent>
      }
    />
  )
}
