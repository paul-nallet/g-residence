import { Selector } from '@astryxdesign/core/Selector'
import { Monitor, Moon, Sun } from 'lucide-react'

export type ThemeMode = 'light' | 'dark' | 'system'

export function ThemeSelector({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return (
    <Selector
      label="Thème"
      isLabelHidden
      variant="ghost"
      presentation="adaptive"
      value={mode}
      startIcon={mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor}
      options={[
        { value: 'light', label: 'Clair', icon: Sun },
        { value: 'dark', label: 'Sombre', icon: Moon },
        { value: 'system', label: 'Système', icon: Monitor },
      ]}
      onChange={(value) => {
        if (value === 'light' || value === 'dark' || value === 'system') onChange(value)
      }}
    />
  )
}
