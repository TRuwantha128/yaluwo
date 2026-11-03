import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API_ORIGIN, auth, get, onStepUpNeeded, post, refresh, restoreSession } from '../api/client'
import StepUpDialog from './StepUpDialog'

const AuthContext = createContext(null)
const MODE_KEY = 'yaluwo.mode'
export const PARTNER_ROLES = ['DRIVER', 'FLEET', 'SUPPLIER', 'GUIDE', 'ACTIVITY']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [unread, setUnread] = useState({ notifications: 0, messages: 0 })
  const [mode, setModeState] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY)
    } catch {
      return null
    }
  })
  const socket = useRef(null)
  const listeners = useRef(new Set())
  const [stepUp, setStepUp] = useState(null)

  const loadCounts = useCallback(async () => {
    try {
      const [n, t] = await Promise.all([get('/me/notifications'), get('/threads')])
      setUnread({ notifications: n.unread, messages: t.unread })
    } catch {
      // not logged in
    }
  }, [])

  // On first load, try the refresh cookie: a returning visitor stays logged in
  useEffect(() => {
    restoreSession().then((r) => {
      setUser(r?.user ?? null)
      setReady(true)
    })
  }, [])

  // Live updates: notifications, chat messages and trip status changes
  useEffect(() => {
    if (!user) return
    loadCounts()
    const opts = { path: '/api/v1/live', auth: (cb) => cb({ token: auth.token }), transports: ['websocket', 'polling'], withCredentials: true }
    const s = API_ORIGIN ? io(API_ORIGIN, opts) : io(opts)
    s.on('notification', (n) => {
      setUnread((u) => ({ ...u, notifications: u.notifications + 1 }))
      listeners.current.forEach((l) => l('notification', n))
    })
    s.on('message', (m) => {
      setUnread((u) => ({ ...u, messages: u.messages + 1 }))
      listeners.current.forEach((l) => l('message', m))
    })
    s.on('trip', (t) => listeners.current.forEach((l) => l('trip', t)))
    s.on('inbox', (x) => listeners.current.forEach((l) => l('inbox', x)))
    s.on('connect_error', async () => {
      await refresh()
    })
    socket.current = s
    return () => {
      s.close()
      socket.current = null
    }
  }, [user, loadCounts])

  // Sensitive actions ask for the password (and code) in a dialog
  useEffect(() => {
    onStepUpNeeded(() => new Promise((resolve) => setStepUp({ resolve })))
  }, [])

  const login = useCallback((session) => {
    auth.set(session.accessToken)
    setUser(session.user)
  }, [])

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => null)
    auth.set(null)
    setUser(null)
  }, [])

  const reloadUser = useCallback(async () => {
    const { user: u } = await get('/auth/me')
    setUser(u)
    return u
  }, [])

  const isPartner = Boolean(user?.roles?.some((r) => PARTNER_ROLES.includes(r)))
  const setMode = (m) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // per-visit only
    }
  }

  const value = useMemo(
    () => ({
      user, ready, login, logout, reloadUser, unread, setUnread, loadCounts,
      isPartner, mode: isPartner ? (mode ?? 'partner') : 'traveller', setMode,
      // Components subscribe to live events: useLive((type, data) => ...)
      subscribe: (fn) => {
        listeners.current.add(fn)
        return () => listeners.current.delete(fn)
      },
      socket,
    }),
    [user, ready, login, logout, reloadUser, unread, loadCounts, isPartner, mode],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {stepUp && (
        <StepUpDialog
          twoStep={user?.twoStep}
          onDone={(ok) => {
            stepUp.resolve(ok)
            setStepUp(null)
          }}
        />
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function useLive(handler) {
  const { subscribe } = useAuth()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe((type, data) => ref.current(type, data)), [subscribe])
}
