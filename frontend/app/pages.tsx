import { lazy, type ComponentType } from 'react'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'

const page = <M, K extends keyof M>(load: () => Promise<M>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<any> })) as M[K]

const auth = () => import('../features/Auth.tsx'),
  calendar = () => import('../features/Calendar.tsx'),
  cleaning = () => import('../features/Cleaning.tsx'),
  ideas = () => import('../features/Ideas.tsx'),
  lotDetail = () => import('../features/LotDetail.tsx'),
  lots = () => import('../features/Lots.tsx'),
  meters = () => import('../features/Meters.tsx'),
  overview = () => import('../features/Overview.tsx'),
  reports = () => import('../features/Reports.tsx'),
  revenue = () => import('../features/Revenue.tsx'),
  stock = () => import('../features/Stock.tsx'),
  studio = () => import('../features/Studio.tsx'),
  team = () => import('../features/Team.tsx'),
  visitTemplates = () => import('../features/VisitTemplateEditor.tsx'),
  visits = () => import('../features/TechnicalVisits.tsx'),
  technical = () => import('../features/Technical.tsx')

export const Auth = page(auth, 'Auth')
export const Calendar = page(calendar, 'Calendar')
export const Cleaning = page(cleaning, 'Cleaning')
export const CleaningTaskDetail = page(cleaning, 'CleaningTaskDetail')
export const CleaningTemplateDetail = page(cleaning, 'CleaningTemplateDetail')
export const CleaningTemplates = page(cleaning, 'CleaningTemplates')
export const Ideas = page(ideas, 'Ideas')
export const LotDetail = page(lotDetail, 'LotDetail')
export const Lots = page(lots, 'Lots')
export const MeterDetail = page(meters, 'MeterDetail')
export const Meters = page(meters, 'Meters')
export const Overview = page(overview, 'Overview')
export const Reports = page(reports, 'Reports')
export const Revenue = page(revenue, 'Revenue')
export const RevenueSourceDetail = page(revenue, 'RevenueSourceDetail')
export const RevenueYear = page(revenue, 'RevenueYear')
export const Stock = page(stock, 'Stock')
export const StockDetail = page(stock, 'StockDetail')
export const Studio = page(studio, 'Studio')
export const Team = page(team, 'Team')
export const VisitTemplateEditor = page(visitTemplates, 'VisitTemplateEditor')
export const VisitTemplates = page(visits, 'VisitTemplates')
export const TechnicalVisits = page(visits, 'TechnicalVisits')
export const TechnicalVisit = page(visits, 'TechnicalVisit')
export const TechnicalIssues = page(technical, 'TechnicalIssues')
export const TechnicalPlaces = page(technical, 'TechnicalPlaces')
export const TechnicalSupplier = page(technical, 'TechnicalSupplier')
export const TechnicalSuppliers = page(technical, 'TechnicalSuppliers')
export const TechnicalWork = page(technical, 'TechnicalWork')
export const TechnicalWorks = page(technical, 'TechnicalWorks')

export function PageLoading() {
  return (
    <Layout
      height="fill"
      padding={4}
      content={
        <LayoutContent>
          <Text as="p" role="status">
            Chargement…
          </Text>
        </LayoutContent>
      }
    />
  )
}
