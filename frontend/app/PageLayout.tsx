import type { ReactNode } from 'react'
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/Stack'

export function PageLayout({
  header,
  navigation,
  footer,
  children,
}: {
  header: ReactNode
  navigation?: ReactNode
  footer?: ReactNode
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
      footer={footer ? <LayoutFooter hasDivider>{footer}</LayoutFooter> : undefined}
    />
  )
}
