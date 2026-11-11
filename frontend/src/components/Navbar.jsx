import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, ChevronDown, CreditCard, LogOut, Map, Menu, MessageCircle, Moon, Plus, Repeat, Shield, Sun, User, X } from 'lucide-react'
import { Avatar, Logo } from './ui'
import { useAuth } from '../auth/AuthProvider'
import Notifications from './Notifications'
import { useTheme } from '../theme/ThemeProvider'

const PUBLIC_LINKS = [
  ['Plan a route', '/#plan'],
  ['Find trips', '/trips'],
  ['Destinations', '/places'],
  ['How it works', '/#how'],
  ['Safety', '/#safety'],
  ['For drivers', '/#partners'],
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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-xl p-1 pr-2 hover:bg-white/10" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={user.fullName} size="h-8 w-8 text-xs" ring={false} />
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="nav-pop absolute right-0 top-12 w-64 rounded-3xl bg-surface p-2 shadow-2xl ring-1 ring-line">
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
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const { mode: colour, toggle } = useTheme()
  const links = !user ? PUBLIC_LINKS : mode === 'partner' ? PARTNER_LINKS : TRAVELLER_LINKS
  const linkClass = ({ isActive }) =>
    `rounded-xl px-3.5 py-2 transition ${isActive && !hash ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`
  const icon = 'grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-white/10 hover:text-white'

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-[clamp(8px,calc(4.5vw_-_16px),56px)] pt-3">
      <nav
        className={`nav-dark mx-auto flex max-w-[1488px] items-center justify-between gap-2 rounded-3xl py-2 pl-4 pr-2 ring-1 backdrop-blur-xl transition-all duration-300 ${
          scrolled || open ? 'bg-night/90 shadow-[0_18px_40px_-22px_rgba(14,16,56,0.8)] ring-white/15' : 'bg-night/90 ring-white/10'
        }`}
        aria-label="Main"
      >
        <Logo light />
        <ul className="hidden items-center gap-0.5 text-sm font-semibold lg:flex">
          {links.map(([label, to]) => (
            <li key={label}>
              {to.includes('#') ? (
                <Link to={to} className={linkClass({ isActive: false })}>{label}</Link>
              ) : (
                <NavLink to={to} end={!['/places'].includes(to)} className={linkClass}>{label}</NavLink>
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <button onClick={toggle} className={icon} aria-label={colour === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {colour === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {ready && !user && (
            <>
              <Link to="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 sm:block">Log in</Link>
              <Link to="/signup" className="inline-flex items-center rounded-2xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-strong">Sign up</Link>
            </>
          )}
          {user && (
            <>
              {mode !== 'partner' && (
                <Link to="/trips/new" className="hidden items-center gap-1.5 rounded-2xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-strong sm:inline-flex">
                  <Plus className="h-4 w-4" /> Create a trip
                </Link>
              )}
              <Link to="/messages" className={`relative ${icon}`} aria-label={`Messages${unread.messages ? `, ${unread.messages} unread` : ''}`}>
                <MessageCircle className="h-5 w-5" />
                {unread.messages > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{unread.messages > 9 ? '9+' : unread.messages}</span>}
              </Link>
              <Notifications />
              <AccountMenu />
            </>
          )}
          <button onClick={() => setOpen(!open)} className={`${icon} lg:hidden`} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.ul initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto mt-2 max-w-[1488px] rounded-3xl bg-night/95 p-2 text-white shadow-xl ring-1 ring-white/15 backdrop-blur-xl lg:hidden">
            {links.map(([label, to]) => (
              <li key={label}>
                <Link to={to} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 font-semibold hover:bg-white/10">{label}</Link>
              </li>
            ))}
            {user && mode !== 'partner' && (
              <li><Link to="/trips/new" className="block rounded-2xl px-4 py-3 font-semibold text-mango hover:bg-white/10">Create a trip</Link></li>
            )}
            {!user && (
              <li><Link to="/login" className="block rounded-2xl px-4 py-3 font-semibold hover:bg-white/10">Log in</Link></li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </header>
  )
}
