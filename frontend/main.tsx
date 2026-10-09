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

const residenceTheme = defineTheme({
  name: 'gresidence-neutral',
  extends: neutralTheme,
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
