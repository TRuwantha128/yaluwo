import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, BadgeCheck, CalendarDays, Compass, Plus, ShieldAlert } from 'lucide-react'
import { get } from '../../api/client'
import { useAuth, useLive } from '../../auth/AuthProvider'
import { Countdown, PageLoader, StatusBadge } from '../../components/form'
import { Cover, btn } from '../../components/ui'
import { kindFor } from '../../lib/places'

function NextAction({ action }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Link to={action.link} className={`group flex items-center gap-4 rounded-3xl p-5 ring-1 transition ${action.urgent ? 'bg-accent text-on-accent ring-accent' : 'bg-brand-soft ring-brand/20 hover:ring-brand'}`}>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wider ${action.urgent ? 'text-on-accent/80' : 'text-brand'}`}>Next step</p>
          <p className="mt-1 text-lg font-bold leading-snug">{action.text}</p>
          {action.dueAt && <Countdown to={action.dueAt} className={action.urgent ? '!text-on-accent' : ''} />}
        </div>
        <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
      </Link>
    </motion.div>
  )
}

function TripRow({ t }) {
  return (
    <Link to={`/trips/${t.code}`} className="group flex gap-4 rounded-3xl bg-surface p-3 ring-1 ring-line transition hover:ring-ink/20">
      <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl">
        <Cover src={t.cover} kind={kindFor(t.route[1] ?? t.route[0])} alt="" />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
          {t.role === 'ORGANISER' && <span className="text-xs font-semibold text-muted">You organise</span>}
          {t.memberStatus === 'REQUESTED' && <span className="text-xs font-semibold text-accent">Request sent</span>}
        </div>
        <p className="mt-1 truncate font-bold">{t.title}</p>
        <p className="truncate text-sm text-muted">{t.route.join(' → ')}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5" /> {t.startDate ?? 'No date yet'} · {t.members}/{t.seats} people</p>
      </div>
    </Link>
  )
}

export default function MyTrips() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const load = () => get('/me/trips').then(setData)
  useEffect(() => {
    load()
  }, [])
  useLive((type) => type === 'trip' && load())
  if (!data) return <PageLoader />
  const actions = data.trips.map((t) => t.next).filter(Boolean).sort((a, b) => Number(b.urgent ?? 0) - Number(a.urgent ?? 0))
  const active = data.trips.filter((t) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(t.status) && !['LEFT', 'EXPIRED', 'REMOVED', 'CANCELLED'].includes(t.memberStatus))
  const past = data.trips.filter((t) => !active.includes(t))

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Hi {user.firstName}</h1>
          <p className="mt-1 text-muted">Your trips, requests and what to do next.</p>
        </div>
        <Link to="/trips/new" className={btn.primary}><Plus className="h-4 w-4" /> Create a trip</Link>
      </div>

      <div className="mt-8 space-y-3">
        {!user.verified && <NextAction action={{ text: 'Verify your ID to join or host trips', link: '/verify', urgent: false }} />}
        {actions.slice(0, 3).map((a, i) => <NextAction key={i} action={a} />)}
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-extrabold tracking-tight">Upcoming</h2>
        {active.length === 0 ? (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-line p-10 text-center">
            <Compass className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 font-semibold">No trips yet</p>
            <p className="mt-1 text-sm text-muted">Join a group that's already going, or start your own.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link to="/trips" className={btn.ghost}>Find trips</Link>
              <Link to="/places" className={btn.ghost}>Explore places</Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">{active.map((t) => <TripRow key={t.code} t={t} />)}</div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-extrabold tracking-tight">Past and cancelled</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{past.map((t) => <TripRow key={t.code} t={t} />)}</div>
        </section>
      )}

      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <Link to="/me/profile" className="rounded-3xl bg-surface p-5 ring-1 ring-line hover:ring-ink/20">
          <p className="font-bold">Profile and quiz</p>
          <p className="mt-1 text-sm text-muted">Photo, bio and the travel-style quiz behind the match %.</p>
        </Link>
        <Link to="/me/payments" className="rounded-3xl bg-surface p-5 ring-1 ring-line hover:ring-ink/20">
          <p className="font-bold">Payments and refunds</p>
          <p className="mt-1 text-sm text-muted">Receipts, slips and refund status.</p>
        </Link>
        <Link to="/settings/security" className="rounded-3xl bg-surface p-5 ring-1 ring-line hover:ring-ink/20">
          <p className="flex items-center gap-2 font-bold">{user.twoStep ? <BadgeCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-accent" />} Security</p>
          <p className="mt-1 text-sm text-muted">Password, two-step login, devices.</p>
        </Link>
      </section>
    </div>
  )
}
