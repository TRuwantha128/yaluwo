import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronUp, MapPin, Trash2, X } from 'lucide-react'
import { tripPicks, useTripPicks } from '../hooks/useTripPicks'

function Thumb({ pick, className = '' }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand text-on-brand ring-2 ring-surface ${className}`}>
      {pick.photo ? <img src={pick.photo} alt="" className="h-full w-full object-cover" /> : <MapPin className="h-4 w-4" />}
    </span>
  )
}

// Floating bar with the places selected for the next trip
export default function PicksTray() {
  const picks = useTripPicks()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (picks.length === 0) setOpen(false)
  }, [picks.length])

  if (pathname.startsWith('/trips/new')) return null

  return (
    <AnimatePresence>
      {picks.length > 0 && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed bottom-3 left-3 right-[4.5rem] z-[55] mx-auto max-w-lg sm:bottom-5 sm:left-24 sm:right-24"
        >
          <div className="overflow-hidden rounded-[28px] bg-surface/95 shadow-[0_20px_60px_rgba(0,0,0,0.25)] ring-1 ring-line backdrop-blur-xl">
            <AnimatePresence initial={false}>
              {open && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="flex items-center justify-between px-5 pt-4">
                    <p className="text-sm font-bold">Your places, in visiting order</p>
                    <button onClick={() => tripPicks.clear()} className="text-xs font-semibold text-muted hover:text-danger">
                      Clear all
                    </button>
                  </div>
                  <ol className="max-h-[45vh] space-y-1 overflow-y-auto px-3 py-3" data-lenis-prevent>
                    {picks.map((p, i) => (
                      <motion.li layout key={p.key} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
                        <span className="w-4 text-center text-xs font-bold text-muted">{i + 1}</span>
                        <Thumb pick={p} className="h-9 w-9" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                        <button disabled={i === 0} onClick={() => tripPicks.move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface disabled:opacity-30" aria-label={`Move ${p.name} up`}>
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button disabled={i === picks.length - 1} onClick={() => tripPicks.move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface disabled:opacity-30" aria-label={`Move ${p.name} down`}>
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button onClick={() => tripPicks.remove(p.key)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" aria-label={`Remove ${p.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3 p-2 pl-3">
              <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
                <span className="flex -space-x-3">
                  {picks.slice(-3).map((p, i, list) => (
                    <Thumb key={p.key} pick={p} className={`h-10 w-10 ${i < list.length - 2 ? 'hidden sm:grid' : ''}`} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {picks.length} {picks.length === 1 ? 'place' : 'places'}
                    <span className="hidden sm:inline"> selected</span>
                  </span>
                  <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted">
                    {open ? 'Hide' : 'Reorder'} <ChevronUp className={`h-3.5 w-3.5 transition ${open ? '' : 'rotate-180'}`} />
                  </span>
                </span>
              </button>
              <Link to="/trips/new?from=picks" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-on-accent transition hover:bg-accent-strong hover:text-white sm:px-5">
                Plan trip <ArrowRight className="h-4 w-4" />
              </Link>
              {!open && (
                <button onClick={() => tripPicks.clear()} className="hidden h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 sm:grid" aria-label="Clear selected places">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
