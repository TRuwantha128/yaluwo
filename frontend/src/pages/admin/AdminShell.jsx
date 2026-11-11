import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BadgeCheck, Banknote, FileClock, Flag, Gavel, Inbox, LogOut, Mail, Map, Settings, Users } from 'lucide-react'
import { get } from '../../api/client'
import { useAuth, useLive } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Logo } from '../../components/ui'
import { LoginForm } from '../auth/Login'

const NAV = [
  ['/admin', 'Today inbox', Inbox, null],
  ['/admin/verifications', 'Verifications', BadgeCheck, ['VERIFICATION', 'TRIP_REVIEW']],
  ['/admin/trips', 'Trips', Map, null],
  ['/admin/users', 'Users and partners', Users, ['SUSPENDED']],
  ['/admin/payments', 'Payments and payouts', Banknote, ['SLIP', 'PAYOUTS', 'REFUNDS', 'CHARGEBACK']],
  ['/admin/disputes', 'Disputes', Gavel, ['DISPUTE']],
  ['/admin/reports', 'Reports', Flag, ['REPORT']],
  ['/admin/settings', 'Settings and rates', Settings, null, 'OWNER'],
  ['/admin/audit', 'Audit log', FileClock, null, 'OWNER'],
]

// The admin works in a separate console with a sidebar and counts (workflow section 20)
export default function AdminShell({ children }) {
  const { user, logout } = useAuth()
  const config = useConfig()
  const [counts, setCounts] = useState({})
  const load = () => get('/admin/today').then((t) => setCounts(t.counts)).catch(() => null)
  useEffect(() => {
    load()
  }, [])
  useLive((type) => (type === 'inbox' || type === 'notification') && load())
  const total = (kinds) => (kinds ? kinds.reduce((s, k) => s + (counts[k] ?? 0), 0) : Object.values(counts).reduce((s, n) => s + n, 0))

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <Logo />
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-bg">Admin</span>
        </div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-0.5 lg:overflow-visible">
          {NAV.filter((n) => !n[4] || user.isOwner).map(([to, label, Icon, kinds]) => {
            const n = to === '/admin' ? total(null) : total(kinds)
            return (
              <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}>
                <Icon className="h-4 w-4" /> <span className="flex-1">{label}</span>
                {n > 0 && kinds !== null && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{n}</span>}
                {to === '/admin' && n > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-bg">{n}</span>}
              </NavLink>
            )
          })}
          {config?.environment === 'local' && user.isOwner && (
            <NavLink to="/admin/outbox" className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}><Mail className="h-4 w-4" /> Dev outbox and clock</NavLink>
          )}
        </nav>
        <div className="hidden border-t border-line px-5 py-4 text-sm lg:block">
          <p className="font-semibold">{user.fullName}</p>
          <p className="text-xs text-muted">{user.isOwner ? 'Owner' : user.permissions.join(', ')}</p>
          <div className="mt-3 flex gap-3 text-xs font-semibold">
            <Link to="/settings/security" className="text-brand hover:underline">Account security</Link>
            <button onClick={logout} className="inline-flex items-center gap-1 text-muted hover:text-ink"><LogOut className="h-3.5 w-3.5" /> Log out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  )
}

export function AdminLogin() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-xl ring-1 ring-line">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Admin console</h1>
        <p className="mt-1 text-sm text-muted">Password and authenticator code. Sessions end after 30 minutes idle.</p>
        <div className="mt-6"><LoginForm admin /></div>
      </div>
    </div>
  )
}

export const PageTitle = ({ title, text, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
    </div>
    {action}
  </div>
)
