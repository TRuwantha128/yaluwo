import { createContext, useContext, useEffect, useState } from 'react'

// Light or dark. The brand colours are fixed (src/index.css); only the mode is the visitor's choice.
const KEY = 'yaluwo.mode'
const ThemeContext = createContext(null)

function initial() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage blocked */
  }
  return 'light'
}

const BRAND = { light: '#2e3192', dark: '#8f95ff' }
const ACCENT = '#f68b1f'

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(initial)
  useEffect(() => {
    document.documentElement.dataset.mode = mode
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      /* the choice still works for this visit */
    }
  }, [mode])
  // theme keeps the old shape ({ mode, brand, accent }) for the maps that tint themselves
  const value = { theme: { mode, brand: BRAND[mode], accent: ACCENT }, mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
