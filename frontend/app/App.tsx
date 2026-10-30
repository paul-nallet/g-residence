import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { SideNav, SideNavCollapseButton, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Text } from '@astryxdesign/core/Text'
import { TopNav } from '@astryxdesign/core/TopNav'
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Sparkles, UserRound } from 'lucide-react'
import {
  Auth,
  Calendar,
  Cleaning,
  CleaningTaskDetail,
  CleaningTemplateDetail,
  CleaningTemplates,
  Ideas,
  LotDetail,
  Lots,
  MeterDetail,
  Meters,
  Overview,
  PageLoading,
  Reports,
  Revenue,
  RevenueSourceDetail,
  RevenueYear,
  Stock,
  StockDetail,
  Studio,
  Team,
  VisitTemplates,
  VisitTemplateEditor,
  TechnicalVisits,
  TechnicalVisit,
  TechnicalIssues,
  TechnicalPlaces,
  TechnicalSupplier,
  TechnicalSuppliers,
  TechnicalWork,
  TechnicalWorks,
} from './pages.tsx'
import { Feedback, Loading, roleLabels } from '../features/status.tsx'
import { call, SESSION_EXPIRED } from '../lib/api.ts'
import { useMutation, useQuery } from '../lib/data.ts'
import { CommandBar } from '../command/CommandBar.tsx'
import { useMobile } from '../lib/useMobile.ts'
import { useCrumb } from './crumb.ts'
import { PageLayout } from './PageLayout.tsx'
import { navGroups, sectionPages, sections } from './sections.ts'
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
    [isStudioOpen, setIsStudioOpen] = useState(false),
    crumb = useCrumb(),
    mobile = useMobile()
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
      <Suspense fallback={<PageLoading />}>
        <Auth
          setup={auth.data.setupRequired}
          allowed={auth.data.setupAllowed}
          invite={invite}
          onConnected={connected}
        />
      </Suspense>
    )
  const me = auth.data.me,
    [path = '', query = ''] = route.split('?'),
    [destination, id, sub] = path.split('/'),
    section = sections.find((item) => item.id === destination) ?? sections[0]
  const visible = sections.filter((item) =>
    me.role === 'cleaner'
      ? ['overview', 'lots', 'calendar', 'cleaning', 'ideas'].includes(item.id)
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
  ) : section.id === 'visits' ? (
    id === 'templates' ? (
      sub ? (
        <VisitTemplateEditor key={sub} id={sub === 'new' ? undefined : sub} />
      ) : (
        <VisitTemplates />
      )
    ) : id ? (
      <TechnicalVisit key={id} id={id} />
    ) : (
      <TechnicalVisits />
    )
  ) : section.id === 'technical' ? (
    id === 'travaux' && sub ? (
      <TechnicalWork key={sub} id={sub} />
    ) : id === 'signalements' ? (
      <TechnicalIssues />
    ) : id === 'fournisseurs' ? (
      sub ? (
        <TechnicalSupplier key={sub} id={sub} />
      ) : (
        <TechnicalSuppliers />
      )
    ) : id === 'lieux' ? (
      <TechnicalPlaces />
    ) : (
      <TechnicalWorks />
    )
  ) : section.id === 'reports' ? (
    <Reports />
  ) : section.id === 'team' ? (
    <Team me={me} />
  ) : section.id === 'ideas' ? (
    <Ideas me={me} />
  ) : (
    <Overview me={me} />
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
          footer={
            <SideNavSection title="Retours" isHeaderHidden>
              {visible
                .filter((item) => item.group === 'feedback')
                .map((item) => (
                  <SideNavItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    href={'#' + item.id}
                    isSelected={item.id === section.id}
                  />
                ))}
            </SideNavSection>
          }
          footerIcons={
            <SideNavCollapseButton>
              <Icon icon={isNavCollapsed ? PanelLeftOpen : PanelLeftClose} />
            </SideNavCollapseButton>
          }
        >
          {navGroups.map((group) => {
            const items = visible.filter((item) => item.group === group.id)
            return items.length ? (
              <SideNavSection key={group.id} title={group.title} isHeaderHidden={group.isHeaderHidden}>
                {items.map((item) => {
                  const pages = (sectionPages[item.id] ?? []).filter(
                    (page) => !page.managerOnly || me.role !== 'cleaner',
                  )
                  return pages.length > 1 ? (
                    <SideNavItem key={item.id} label={item.label} icon={item.icon}>
                      {pages.map((page) => (
                        <SideNavItem
                          key={page.id}
                          label={page.label}
                          href={'#' + item.id + (page.id ? '/' + page.id : '')}
                          isSelected={
                            item.id === section.id &&
                            (page.id ? id === page.id : !pages.some((other) => other.id && other.id === id))
                          }
                        />
                      ))}
                    </SideNavItem>
                  ) : (
                    <SideNavItem
                      key={item.id}
                      label={item.label}
                      icon={item.icon}
                      href={'#' + item.id}
                      isSelected={item.id === section.id}
                    />
                  )
                })}
              </SideNavSection>
            ) : null
          })}
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
                    {!mobile && <BreadcrumbItem href="#overview">{me.residenceName}</BreadcrumbItem>}
                    {(id || query) && crumb && mobile ? (
                      <BreadcrumbItem isCurrent>{crumb}</BreadcrumbItem>
                    ) : (id || query) && crumb ? (
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
                  {!mobile && (
                    <>
                      <Button
                        label={isStudioOpen ? 'Fermer AI Studio' : 'Ouvrir AI Studio'}
                        variant={isStudioOpen ? 'secondary' : 'ghost'}
                        isIconOnly
                        icon={<Icon icon={Sparkles} />}
                        onClick={() => setIsStudioOpen((open) => !open)}
                      />
                      <CommandBar me={me} destinations={visible} />
                      <ThemeSelector mode={themeMode} onChange={onThemeChange} />
                    </>
                  )}
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
        content={<Suspense fallback={<PageLoading />}>{content}</Suspense>}
        end={
          isStudioOpen && !mobile ? (
            <LayoutPanel hasDivider width={400} padding={0} isScrollable={false} role="complementary" label="AI Studio">
              <Suspense fallback={<PageLoading />}>
                <Studio route={route} onClose={() => setIsStudioOpen(false)} />
              </Suspense>
            </LayoutPanel>
          ) : undefined
        }
      />
    </AppShell>
  )
}
