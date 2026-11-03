import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { CalendarDays, Car, Clock } from 'lucide-react'
import { Avatar, Cover, EmptySeat } from './ui'
import { dateRange, rs, tripDays } from '../lib/format'
import { useConfig, vehicleName } from '../config/useConfig'

// Start → end, with the stops in between listed underneath
function RouteDots({ stops }) {
  const first = stops[0]
  const last = stops.at(-1)
  const via = stops.slice(1, -1).map((s) => s.name)
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="truncate">{first?.name}</span>
        {stops.length > 1 && (
          <>
            <span className="min-w-6 flex-1 border-t-2 border-dotted border-accent/60" />
            <span className="truncate">{last.name}</span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          </>
        )}
      </div>
      <p className="mt-1 h-4 truncate text-xs text-muted">{via.length > 0 && `via ${via.join(', ')}`}</p>
    </div>
  )
}

export default function TripCard({ trip: t, preview = false }) {
  const config = useConfig()
  const left = t.seatsLeft ?? Math.max(0, t.seats - t.members.length)
  const Wrapper = preview ? 'div' : Link

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={preview ? undefined : { y: -6 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <Wrapper
        to={preview ? undefined : `/trips/${t.id}`}
        className="group block rounded-3xl bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-line transition-shadow duration-300 hover:shadow-[0_24px_50px_-24px_color-mix(in_oklab,var(--brand-ui)_45%,transparent)]"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-t-3xl">
          <Cover src={t.cover} kind={t.stops[1]?.kind ?? t.stops[0]?.kind} alt={t.title} className="transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5 text-brand" /> {dateRange(t.startDate, t.stops)}
            </span>
            {t.womenOnly && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">Women only</span>}
          </div>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {t.stops.length} {t.stops.length === 1 ? 'stop' : 'stops'}
          </span>
        </div>

        <div className="px-5 pt-4">
          <h3 className="line-clamp-1 text-lg font-bold tracking-tight">{t.title}</h3>
          <div className="mt-2">
            <RouteDots stops={t.stops} />
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {tripDays(t.stops)} days
            </span>
            {t.vehicle && (
              <span className="flex items-center gap-1">
                <Car className="h-3.5 w-3.5" /> {vehicleName(config, t.vehicle)}
              </span>
            )}
          </div>
        </div>

        <div className="perforation relative my-4 h-px">
          <div className="mx-5 border-t-2 border-dashed border-line" />
        </div>

        <div className="flex items-end justify-between gap-3 px-5 pb-5">
          <div>
            <div className="flex -space-x-2">
              {t.members.slice(0, 5).map((m, i) => (
                <Avatar key={(m.memberId ?? m.name) + '-' + i} name={m.name} i={i} size="h-7 w-7 text-[10px]" />
              ))}
              {Array.from({ length: Math.min(left, 4) }, (_, i) => (
                <EmptySeat key={i} size="h-7 w-7" />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {left > 0 ? (
                <>
                  <b className="text-accent">{left}</b> of {t.seats} seats left
                </>
              ) : (
                <b className="text-ink">Trip is full</b>
              )}
            </p>
          </div>
          <div className="text-right">
            {t.price ? (
              <>
                <p className="text-xl font-extrabold tracking-tight">{rs(t.price)}</p>
                <p className="text-xs text-muted">about, per person</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-muted">Price after driver offers</p>
            )}
          </div>
        </div>
      </Wrapper>
    </motion.div>
  )
}
