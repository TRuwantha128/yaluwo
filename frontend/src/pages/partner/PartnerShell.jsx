import { NavLink } from 'react-router-dom'
import { CalendarDays, Car, Gauge, HandCoins, Inbox, Send } from 'lucide-react'

const TABS = [
  ['/partner', 'Dashboard', Gauge],
  ['/partner/requests', 'Requests', Inbox],
  ['/partner/offers', 'Find trips', Send],
  ['/partner/vehicles', 'Vehicles', Car],
  ['/partner/calendar', 'Calendar', CalendarDays],
  ['/partner/earnings', 'Earnings', HandCoins],
]

export default function PartnerShell({ title, text, children, action }) {
  return (
    <div className="wrap pb-16 pt-24">
      <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Driver menu">
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
          {text && <p className="mt-1 text-muted">{text}</p>}
        </div>
        {action}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  )
}
