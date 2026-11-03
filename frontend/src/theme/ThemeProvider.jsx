import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'yaluwo.theme.v2'

export const PRESETS = [
  { name: 'Yaluwo', brand: '#2E3192', accent: '#F5891A' },
  { name: 'Ocean', brand: '#0B6BCB', accent: '#FF6B4A' },
  { name: 'Lagoon', brand: '#0E9488', accent: '#F59E0B' },
  { name: 'Tea', brand: '#2E7D4F', accent: '#E2A72E' },
  { name: 'Sunset', brand: '#E4572E', accent: '#2563EB' },
  { name: 'Royal', brand: '#5B4BDB', accent: '#F43F5E' },
  { name: 'Graphite', brand: '#1F2937', accent: '#F97316' },
]

const DEFAULT = { brand: PRESETS[0].brand, accent: PRESETS[0].accent, mode: 'light' }

// Choose white or black text so buttons stay readable on any colour the user picks
function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? '#0E1726' : '#FFFFFF'
}

function load() {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }
  } catch {
    return DEFAULT
  }
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(load)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--brand', theme.brand)
    root.style.setProperty('--accent', theme.accent)
    root.style.setProperty('--on-brand', readableOn(theme.brand))
    root.style.setProperty('--on-accent', readableOn(theme.accent))
    root.dataset.mode = theme.mode
    try {
      localStorage.setItem(KEY, JSON.stringify(theme))
    } catch {
      /* storage blocked: theme still works for this visit */
    }
  }, [theme])

  const value = {
    theme,
    update: (patch) => setTheme((t) => ({ ...t, ...patch })),
    reset: () => setTheme(DEFAULT),
  }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
