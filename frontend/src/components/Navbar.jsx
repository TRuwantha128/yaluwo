import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, ChevronDown, CreditCard, LogOut, Map, Menu, MessageCircle, Plus, Repeat, Shield, User, X } from 'lucide-react'
import { Avatar, Logo } from './ui'
import { useAuth } from '../auth/AuthProvider'
import Notifications from './Notifications'

const PUBLIC_LINKS = [
  ['Home', '/'],
  ['Find trips', '/trips'],
  ['Destinations', '/places'],
  ['How it works', '/#how'],
]
const TRAVELLER_LINKS = [
  ['Find trips', '/trips'],
  ['Destinations', '/places'],
  ['My trips', '/me'],
]
const PARTNER_LINKS = [
  ['Dashboard', '/partner'],
  ['Requests', '/partner/requests'],
  ['Find trips', '/partner/offers'],
  ['Earnings', '/partner/earnings'],
]

function AccountMenu() {
  const { user, logout, isPartner, mode, setMode } = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const switchMode = () => {
    const next = mode === 'partner' ? 'traveller' : 'partner'
    setMode(next)
    navigate(next === 'partner' ? '/partner' : '/me')
  }
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-surface-2'
  const notVerified = !user.verified

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-full p-1 pr-2 hover:bg-surface-2" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={user.fullName} size="h-8 w-8 text-xs" ring={false} />
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-12 w-64 rounded-3xl bg-surface p-2 shadow-2xl ring-1 ring-line">
            <div className="px-3 py-2">
              <p className="truncate font-bold">{user.fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            {notVerified && (
              <Link to="/verify" className={`${item} text-accent`}><BadgeCheck className="h-4 w-4" /> Verify your ID</Link>
            )}
            <Link to="/me" className={item}><Map className="h-4 w-4" /> My trips</Link>
            <Link to="/me/profile" className={item}><User className="h-4 w-4" /> Profile</Link>
            <Link to="/me/payments" className={item}><CreditCard className="h-4 w-4" /> Payments</Link>
            <Link to="/settings/security" className={item}><Shield className="h-4 w-4" /> Login and security</Link>
            {isPartner && (
              <button onClick={switchMode} className={item}><Repeat className="h-4 w-4" /> {mode === 'partner' ? 'Switch to travelling' : 'Switch to driving'}</button>
            )}
            <div className="my-1 border-t border-line" />
            <button onClick={async () => { await logout(); navigate('/') }} className={`${item} text-muted`}><LogOut className="h-4 w-4" /> Log out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const { user, ready, mode, unread } = useAuth()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  // At the top of the home page the bar sits on the photo; once you scroll it
  // shrinks into a floating glass bar
  // Pages that open with a full photo header
  const photoTop = pathname === '/' || pathname === '/trips'
  const clear = photoTop && !scrolled && !open
  const floating = scrolled || open
  const links = !user ? PUBLIC_LINKS : mode === 'partner' ? PARTNER_LINKS : TRAVELLER_LINKS
  const isActive = (to) => !hash && !to.includes('#') && (to === '/' ? pathname === '/' : pathname === to || (to === '/places' && pathname.startsWith('/places')))
  const tone = clear ? 'text-white/80 hover:text-white' : 'text-muted hover:text-ink'
  const solidBtn = clear ? 'bg-white text-night hover:bg-white/90' : 'bg-ink text-bg hover:opacity-90'

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        className={`pointer-events-auto relative mx-auto transition-[max-width,margin,border-radius,background-color,box-shadow,width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
          floating
            ? 'mt-3 w-[calc(100%-24px)] max-w-[1080px] rounded-[22px] bg-surface/95 shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--night)_30%,transparent)] ring-1 ring-line backdrop-blur-xl'
            : 'mt-0 w-full max-w-[1600px] rounded-none bg-transparent'
        } ${clear ? '[&_.text-ink]:text-white' : ''}`}
      >
        <nav className={`flex h-16 items-center justify-between gap-4 transition-[padding] duration-500 ${floating ? 'pl-4 pr-2' : 'px-[clamp(20px,4.5vw,72px)]'}`} aria-label="Main">
          <Logo light={clear} />
          <ul className="hidden items-center gap-1 text-[15px] font-medium lg:flex">
            {links.map(([label, to]) => {
              const active = isActive(to)
              return (
                <li key={label} className="relative">
                  {active && <motion.span layoutId="nav-active" className={`absolute inset-0 rounded-full ${clear ? 'bg-white/15' : 'bg-surface-2'}`} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  <Link to={to} aria-current={active ? 'page' : undefined} className={`relative block rounded-full px-4 py-2 transition-colors ${active ? (clear ? 'text-white' : 'text-ink') : tone}`}>
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-1.5">
            {ready && !user && (
              <>
                <Link to="/login" className={`hidden rounded-full px-4 py-2 text-[15px] font-medium transition-colors sm:block ${tone}`}>Log in</Link>
                <Link to="/signup" className={`inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${solidBtn}`}>Sign up</Link>
              </>
            )}
            {user && (
              <>
                {mode !== 'partner' && (
                  <Link to="/trips/new" className={`mr-1 hidden items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition sm:inline-flex ${solidBtn}`}>
                    <Plus className="h-4 w-4" /> Create a trip
                  </Link>
                )}
                <Link to="/messages" className="relative grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-surface-2/60" aria-label={`Messages${unread.messages ? `, ${unread.messages} unread` : ''}`}>
                  <MessageCircle className="h-5 w-5" />
                  {unread.messages > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{unread.messages > 9 ? '9+' : unread.messages}</span>}
                </Link>
                <Notifications />
                <AccountMenu />
              </>
            )}
            <button onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full text-ink lg:hidden" aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
              <ul className="border-t border-line px-4 py-2">
                {links.map(([label, to]) => (
                  <li key={label}>
                    <Link to={to} onClick={() => setOpen(false)} className={`block border-b border-line py-3.5 text-lg font-medium last:border-0 ${isActive(to) ? 'text-brand' : ''}`}>{label}</Link>
                  </li>
                ))}
                {user && mode !== 'partner' && <li><Link to="/trips/new" className="block py-3.5 text-lg font-semibold text-brand">Create a trip</Link></li>}
                {!user && <li><Link to="/login" className="block py-3.5 text-lg font-medium">Log in</Link></li>}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
