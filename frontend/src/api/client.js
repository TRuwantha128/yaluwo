// One place that talks to the Yaluwo API (backend/).
// The short-lived access token lives only in memory; the refresh token is an
// httpOnly cookie the browser sends to /api/v1/auth, so scripts can't read it.
// VITE_API_URL is the API's address when it runs on its own domain
// (e.g. https://api.tharinduruwantha.dev). Empty in development: Vite forwards /api.
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const BASE = `${API_ORIGIN}/api/v1`

let accessToken = null
let refreshing = null
const listeners = new Set()

export const auth = {
  get token() {
    return accessToken
  },
  set(token) {
    accessToken = token
    listeners.forEach((l) => l(token))
  },
  onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Request failed (${status})`)
    this.status = status
    this.code = body?.error?.code
    this.fields = body?.error?.fields ?? {}
  }
}

// Ask for a new access token with the refresh cookie (one request at a time)
export function refresh() {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok || res.status === 204) {
        auth.set(null)
        return null
      }
      const body = await res.json()
      auth.set(body.accessToken)
      return body
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// Restore the session as soon as the app loads (before any page asks for data)
const boot = refresh()
export const restoreSession = () => boot

// Sensitive actions: the step-up dialog sets this for 5 minutes
let stepUpToken = null
let stepUpUntil = 0
export const stepUp = {
  set(token, seconds = 300) {
    stepUpToken = token
    stepUpUntil = Date.now() + seconds * 1000 - 5000
  },
  get: () => (Date.now() < stepUpUntil ? stepUpToken : null),
}
let stepUpHandler = null
export const onStepUpNeeded = (fn) => {
  stepUpHandler = fn
}

export async function api(path, { method = 'GET', body, form, query, retry = true } = {}) {
  // On page load the session is restored from the cookie first, so the first
  // requests go out as the logged-in person (not as a visitor)
  if (refreshing && !path.startsWith('/auth/')) await refreshing
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  const headers = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const step = stepUp.get()
  if (step) headers['X-Step-Up'] = step
  let payload
  if (form) {
    payload = new FormData()
    for (const [k, v] of Object.entries(form)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) v.forEach((x) => payload.append(k, x))
      else payload.append(k, v)
    }
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'include' })
  } catch {
    // The request never reached the API (offline, or the server is still waking up)
    throw new ApiError(0, { error: { code: 'NETWORK', message: "Can't reach the Yaluwo server. It may be waking up: wait a moment and try again." } })
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const ok = await refresh()
    if (ok) return api(path, { method, body, form, query, retry: false })
  }
  const type = res.headers.get('content-type') ?? ''
  // A web page where JSON was expected means the website is not pointed at the API (VITE_API_URL)
  if (type.includes('text/html')) throw new ApiError(res.status, { error: { code: 'NO_API', message: 'The website is not connected to the Yaluwo server. (Hosting: check VITE_API_URL.)' } })
  const data = type.includes('application/json') ? await res.json() : await res.blob()
  if (!res.ok) {
    const err = new ApiError(res.status, data)
    // Ask for the password + code, then try once more
    if (err.code === 'STEP_UP_REQUIRED' && stepUpHandler && retry) {
      const done = await stepUpHandler()
      if (done) return api(path, { method, body, form, query, retry: false })
    }
    throw err
  }
  return data
}

export const get = (path, query) => api(path, { query })
export const post = (path, body) => api(path, { method: 'POST', body })
export const put = (path, body) => api(path, { method: 'PUT', body })
export const del = (path) => api(path, { method: 'DELETE' })
export const upload = (path, form, method = 'POST') => api(path, { method, form })

// Files (receipts, bank files) that need the login header
export async function download(path, filename) {
  const blob = await api(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
export async function openFile(path) {
  const blob = await api(path)
  window.open(URL.createObjectURL(blob), '_blank')
}
