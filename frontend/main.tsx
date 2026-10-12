import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import { defineTheme, Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import frFR from '@astryxdesign/core/locales/fr-FR.generated.js'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import { App } from './app/App.tsx'
import type { ThemeMode } from './app/ThemeSelector.tsx'

const navy = '#032230',
  beige = '#f9f8f0',
  blue = '#004666',
  yellow = '#ffcc00',
  fallbacks = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

const residenceTheme = defineTheme({
  name: 'gresidence-student-factory',
  extends: neutralTheme,
  typography: {
    body: { family: 'Lato', fallbacks },
    heading: { family: 'Oswald', fallbacks, weight: 'medium', weights: { 3: 'medium', 4: 'medium' } },
  },
  radius: { base: 2, multiplier: 1 },
  tokens: {
    '--color-background-body': [beige, '#021a24'],
    '--color-background-surface': ['#ffffff', navy],
    '--color-background-card': ['#ffffff', '#06293a'],
    '--color-background-popover': ['#ffffff', '#0a3144'],
    '--color-background-muted': ['#f1efe4', '#0a3144'],
    '--color-accent': [blue, yellow],
    '--color-accent-muted': ['#e1ecf0', 'rgba(255, 204, 0, 0.16)'],
    '--color-on-accent': ['#ffffff', navy],
    '--color-text-accent': [blue, yellow],
    '--color-icon-accent': [blue, yellow],
    '--color-text-primary': [navy, beige],
    '--color-text-secondary': ['#4d6470', '#a9b4b9'],
    '--color-text-disabled': ['#9aa5ab', '#5b6f78'],
    '--color-icon-primary': [navy, beige],
    '--color-icon-secondary': ['#5f7480', '#a9b4b9'],
    '--color-icon-disabled': ['#9aa5ab', '#5b6f78'],
    '--color-neutral': ['rgba(3, 34, 48, 0.06)', 'rgba(249, 248, 240, 0.1)'],
    '--color-overlay-hover': ['rgba(3, 34, 48, 0.05)', 'rgba(249, 248, 240, 0.06)'],
    '--color-overlay-pressed': ['rgba(3, 34, 48, 0.1)', 'rgba(249, 248, 240, 0.1)'],
    '--color-border': ['rgba(3, 34, 48, 0.1)', 'rgba(249, 248, 240, 0.12)'],
    '--color-border-emphasized': ['#bfc2c4', '#2a4a59'],
    '--color-skeleton': ['#eceee9', '#0f3a4e'],
  },
  components: {
    'app-shell-sidenav': {
      base: { backgroundColor: 'var(--color-background-body)' },
    },
    'side-nav': {
      base: { backgroundColor: 'var(--color-background-body)' },
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Point de montage introuvable.')

function Root() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('gresidence-theme-mode')
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    } catch {
      return 'dark'
    }
    return 'dark'
  })
  const changeMode = (next: ThemeMode) => {
    setMode(next)
    try {
      localStorage.setItem('gresidence-theme-mode', next)
    } catch {
      return
    }
  }
  return (
    <InternationalizationProvider locale="fr-FR" messages={{ 'fr-FR': frFR }}>
      <Theme theme={residenceTheme} mode={mode}>
        <App themeMode={mode} onThemeChange={changeMode} />
      </Theme>
    </InternationalizationProvider>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
