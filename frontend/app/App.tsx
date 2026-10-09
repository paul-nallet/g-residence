import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { SideNav, SideNavCollapseButton, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TopNav } from '@astryxdesign/core/TopNav'
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { Auth } from '../features/Auth.tsx'
import { Calendar } from '../features/Calendar.tsx'
import { Cleaning, CleaningTaskDetail, CleaningTemplateDetail, CleaningTemplates } from '../features/Cleaning.tsx'
import { LotDetail } from '../features/LotDetail.tsx'
import { Lots } from '../features/Lots.tsx'
import { MeterDetail, Meters } from '../features/Meters.tsx'
import { Revenue, RevenueSourceDetail, RevenueYear } from '../features/Revenue.tsx'
import { Stock, StockDetail } from '../features/Stock.tsx'
import { Overview } from '../features/Overview.tsx'
import { Reports } from '../features/Reports.tsx'
import { Team } from '../features/Team.tsx'
import { Feedback, Loading, roleLabels } from '../features/shared.tsx'
import { call, SESSION_EXPIRED } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { CommandMenu } from './CommandMenu.tsx'
import { useCrumb } from './crumb.ts'
import { PageLayout } from './PageLayout.tsx'
import { sections } from './sections.ts'
import { ThemeSelector, type ThemeMode } from './ThemeSelector.tsx'

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}
const snapshot = () => window.location.hash.slice(1) || 'overview'

export function App({ themeMode, onThemeChange }: { themeMode: ThemeMode; onThemeChange: (mode: ThemeMode) => void }) {
  const route = useSyncExternalStore(subscribe, snapshot, () => 'overview'),
    load = useCallback(() => call((client) => client.auth.status()), []),
    auth = useQuery('auth', load),
    mutation = useMutation(),
    [isNavCollapsed, setIsNavCollapsed] = useState(false),
    crumb = useCrumb()
  const { refresh: refreshAuth } = auth
  useEffect(() => {
    const expired = () => void refreshAuth()
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => window.removeEventListener(SESSION_EXPIRED, expired)
  }, [refreshAuth])
  if (!auth.data)
    return (
      <Layout
        content={
          <LayoutContent padding={6}>
            <Loading error={auth.error} retry={() => void auth.refresh()} />
          </LayoutContent>
        }
      />
    )
  const invite = new URL(window.location.href).searchParams.get('invite') ?? ''
  const connected = () => {
    if (invite) window.history.replaceState(null, '', window.location.pathname + '#overview')
    void auth.refresh()
  }
  if (!auth.data.me || invite)
    return (
      <Auth setup={auth.data.setupRequired} allowed={auth.data.setupAllowed} invite={invite} onConnected={connected} />
    )
  const me = auth.data.me,
    [path = '', query = ''] = route.split('?'),
    [destination, id, sub] = path.split('/'),
    section = sections.find((item) => item.id === destination) ?? sections[0]
  const visible = sections.filter((item) =>
    me.role === 'cleaner'
      ? ['overview', 'lots', 'calendar', 'cleaning'].includes(item.id)
      : item.id !== 'team' || me.role === 'admin',
  )
  const allowed =
    visible.some((item) => item.id === section.id) &&
    !(section.id === 'cleaning' && id === 'fiches' && me.role === 'cleaner')
  const content = !allowed ? (
    <PageLayout header={<Heading level={1}>Accès réservé</Heading>}>
      <Text>Cette rubrique n’est pas accessible avec votre rôle.</Text>
      <Button label="Revenir à l’accueil" href="#overview" />
    </PageLayout>
  ) : section.id === 'overview' ? (
    <Overview me={me} />
  ) : section.id === 'lots' ? (
    id ? (
      <LotDetail key={id} id={id} me={me} />
    ) : (
      <Lots me={me} />
    )
  ) : section.id === 'calendar' ? (
    <Calendar />
  ) : section.id === 'cleaning' ? (
    id === 'fiches' ? (
      sub ? (
        <CleaningTemplateDetail key={sub} id={sub} />
      ) : (
        <CleaningTemplates />
      )
    ) : id ? (
      <CleaningTaskDetail key={id} id={id} me={me} />
    ) : (
      <Cleaning me={me} />
    )
  ) : section.id === 'meters' ? (
    id ? (
      <MeterDetail key={id} id={id} />
    ) : (
      <Meters />
    )
  ) : section.id === 'stock' ? (
    id ? (
      <StockDetail key={id} id={id} />
    ) : (
      <Stock view={new URLSearchParams(query).get('vue') ?? ''} />
    )
  ) : section.id === 'services' ? (
    id === 'annee' ? (
      <RevenueYear />
    ) : id ? (
      <RevenueSourceDetail key={id} id={id} />
    ) : (
      <Revenue />
    )
  ) : section.id === 'reports' ? (
    <Reports />
  ) : section.id === 'team' ? (
    <Team me={me} />
  ) : (
    <PageLayout
      header={
        <VStack gap={1}>
          <Heading level={1}>{section.label}</Heading>
          <Text color="secondary">{section.description}</Text>
        </VStack>
      }
    >
      <Text color="secondary">Cet espace sera construit après cette première V1.</Text>
      <List hasDividers header={<Heading level={2}>Besoins retenus</Heading>}>
        {section.items.map(([label, description]) => (
          <ListItem key={label} label={label} description={description} />
        ))}
      </List>
    </PageLayout>
  )
  return (
    <AppShell
      variant="section"
      contentPadding={0}
      banner={mutation.error ? <Feedback error={mutation.error} /> : undefined}
      mobileNav={{ breakpoint: 'md' }}
      sideNav={
        <SideNav
          aria-label="Navigation de la résidence"
          collapsible={{ isCollapsed: isNavCollapsed, onCollapsedChange: setIsNavCollapsed, hasButton: false }}
          header={<SideNavHeading heading="GResidence" subheading={me.residenceName} headingHref="#overview" />}
          resizable={{ defaultWidth: 240, minWidth: 200, maxWidth: 320 }}
          footerIcons={
            <SideNavCollapseButton>
              <Icon icon={isNavCollapsed ? PanelLeftOpen : PanelLeftClose} />
            </SideNavCollapseButton>
          }
        >
          <SideNavSection title="Rubriques" isHeaderHidden>
            {visible.map((item) => (
              <SideNavItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                href={'#' + item.id}
                isSelected={item.id === section.id}
              />
            ))}
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout
        height="fill"
        padding={0}
        header={
          <LayoutHeader padding={0} hasDivider>
            <TopNav
              label="Barre supérieure de la résidence"
              startContent={
                <>
                  <Button
                    label="Retour"
                    variant="ghost"
                    isIconOnly
                    icon={<Icon icon={ArrowLeft} />}
                    onClick={() => history.back()}
                  />
                  <Breadcrumbs label="Rubrique actuelle" variant="supporting">
                    <BreadcrumbItem href="#overview">{me.residenceName}</BreadcrumbItem>
                    {(id || query) && crumb ? (
                      <>
                        <BreadcrumbItem href={'#' + section.id}>{section.label}</BreadcrumbItem>
                        <BreadcrumbItem isCurrent>{crumb}</BreadcrumbItem>
                      </>
                    ) : (
                      <BreadcrumbItem isCurrent>{section.label}</BreadcrumbItem>
                    )}
                  </Breadcrumbs>
                </>
              }
              endContent={
                <>
                  <CommandMenu destinations={visible} />
                  <ThemeSelector mode={themeMode} onChange={onThemeChange} />
                  <MoreMenu
                    label={'Compte de ' + me.name + ' · ' + roleLabels[me.role]}
                    icon={<Icon icon={UserRound} />}
                    alignment="end"
                    presentation="adaptive"
                    isDisabled={mutation.busy}
                    items={[
                      {
                        type: 'section',
                        title: me.name + ' · ' + roleLabels[me.role],
                        items: [
                          {
                            label: 'Se déconnecter',
                            onClick: () =>
                              void mutation.run(
                                () => call((client) => client.auth.logout()),
                                () => void auth.refresh(),
                              ),
                          },
                        ],
                      },
                    ]}
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={content}
      />
    </AppShell>
  )
}
