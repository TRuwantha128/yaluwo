import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Moon, Palette, RotateCcw, Sun, X } from 'lucide-react'
import { PRESETS, useTheme } from './ThemeProvider'

const same = (a, b) => a.toLowerCase() === b.toLowerCase()

// A tiny picture of the site in these colours: page, a card, a main button and a highlight button
function Preview({ brand, accent, dark }) {
  const bg = dark ? `color-mix(in oklab, ${brand} 16%, #06070c)` : `color-mix(in oklab, ${brand} 5%, #f7f8fa)`
  const card = dark ? `color-mix(in oklab, ${brand} 22%, #0d0f16)` : '#ffffff'
  const line = dark ? `color-mix(in oklab, ${brand} 30%, #22263a)` : `color-mix(in oklab, ${brand} 10%, #e5e7ec)`
  const ui = dark ? `color-mix(in oklab, ${brand} 72%, white)` : brand
  return (
    <span className="block w-full overflow-hidden rounded-xl p-2" style={{ background: bg }}>
      <span className="block rounded-lg p-1.5" style={{ background: card, boxShadow: `inset 0 0 0 1px ${line}` }}>
        <span className="block h-1.5 w-10 rounded-full" style={{ background: line }} />
        <span className="mt-1.5 flex gap-1">
          <span className="h-2.5 w-7 rounded-full" style={{ background: ui }} />
          <span className="h-2.5 w-5 rounded-full" style={{ background: accent }} />
        </span>
      </span>
    </span>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ring-line transition hover:ring-ink/25">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{value.toUpperCase()}</span>
      </span>
      <span className="text-xs font-medium text-muted group-hover:text-ink">Change</span>
    </label>
  )
}

export default function ThemePanel() {
  const [open, setOpen] = useState(false)
  const { theme, update, reset } = useTheme()
  const box = useRef(null)
  const dark = theme.mode === 'dark'

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="fixed bottom-5 right-5 z-[60]">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-16 right-0 max-h-[calc(100svh-7rem)] w-[min(360px,calc(100vw-2.5rem))] overflow-y-auto rounded-[28px] bg-surface/95 p-5 text-ink shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] ring-1 ring-line backdrop-blur-xl"
            data-lenis-prevent
            role="dialog"
            aria-label="Website colours"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">Colours</p>
                <p className="mt-0.5 text-sm text-muted">The whole site follows your choice. Saved on this device.</p>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 transition hover:bg-line" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Light / dark */}
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
              {[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([mode, Icon, label]) => (
                <button key={mode} onClick={() => update({ mode })} className={`relative flex items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold transition-colors ${theme.mode === mode ? 'text-ink' : 'text-muted hover:text-ink'}`} aria-pressed={theme.mode === mode}>
                  {theme.mode === mode && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <Icon className="relative h-4 w-4" /> <span className="relative">{label}</span>
                </button>
              ))}
            </div>

            {/* Ready-made sets, each shown as a tiny preview of the site */}
            <p className="mt-6 text-sm font-semibold">Colour sets</p>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {PRESETS.map((p) => {
                const active = same(p.brand, theme.brand) && same(p.accent, theme.accent)
                return (
                  <button
                    key={p.name}
                    onClick={() => update({ brand: p.brand, accent: p.accent })}
                    aria-pressed={active}
                    className={`relative rounded-2xl p-1.5 text-left transition ${active ? 'ring-2 ring-brand' : 'ring-1 ring-line hover:ring-ink/25'}`}
                  >
                    <Preview brand={p.brand} accent={p.accent} dark={dark} />
                    <span className="mt-1.5 flex items-center justify-between px-1 pb-0.5 text-xs font-semibold">
                      {p.name}
                      {active && <Check className="h-3.5 w-3.5 text-brand" />}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Own colours */}
            <p className="mt-6 text-sm font-semibold">Your own colours</p>
            <div className="mt-3 space-y-2">
              <ColorField label="Main colour" value={theme.brand} onChange={(brand) => update({ brand })} />
              <ColorField label="Highlight colour" value={theme.accent} onChange={(accent) => update({ accent })} />
            </div>

            <button onClick={reset} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
              <RotateCcw className="h-4 w-4" /> Back to the Yaluwo colours
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen(!open)}
        className="group flex h-12 items-center gap-2 rounded-full bg-surface/90 pl-1.5 pr-4 text-sm font-semibold text-ink shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] ring-1 ring-line backdrop-blur-xl transition hover:-translate-y-0.5"
        aria-label="Change website colours"
        aria-expanded={open}
      >
        <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full">
          <span className="absolute inset-0" style={{ background: `conic-gradient(${theme.brand} 0 50%, ${theme.accent} 50% 100%)` }} />
          {open ? <X className="relative h-4 w-4 text-white" /> : <Palette className="relative h-4 w-4 text-white" />}
        </span>
        <span className="hidden sm:inline">Colours</span>
      </button>
    </div>
  )
}
