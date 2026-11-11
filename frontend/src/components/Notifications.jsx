import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bell } from 'lucide-react'
import { get, post } from '../api/client'
import { useAuth } from '../auth/AuthProvider'

const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d)) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}

export default function Notifications() {
  const { unread, setUnread } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    get('/me/notifications').then((d) => setItems(d.items))
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const readAll = async () => {
    await post('/me/notifications/read', {})
    setUnread((u) => ({ ...u, notifications: 0 }))
    setItems((x) => x.map((n) => ({ ...n, read: true })))
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} className="relative grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-surface-2" aria-label={`Notifications${unread.notifications ? `, ${unread.notifications} unread` : ''}`}>
        <Bell className="h-5 w-5" />
        {unread.notifications > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{unread.notifications > 9 ? '9+' : unread.notifications}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="nav-pop absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-line">
            <div className="flex items-center justify-between px-5 py-3">
              <p className="font-bold">Notifications</p>
              {items.some((n) => !n.read) && <button onClick={readAll} className="text-xs font-semibold text-brand hover:underline">Mark all read</button>}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto border-t border-line" data-lenis-prevent>
              {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nothing yet</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <Link to={n.link ?? '#'} onClick={() => setOpen(false)} className={`flex gap-3 px-5 py-3 hover:bg-surface-2 ${n.read ? '' : 'bg-brand-soft/60'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
