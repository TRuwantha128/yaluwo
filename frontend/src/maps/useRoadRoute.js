import { useEffect, useState } from 'react'
import { post } from '../api/client'

// Distance, drive time, road line and prices for a list of stops, from the Yaluwo API
// (POST /routes/compute). The API uses Google when it has a key and OpenStreetMap roads
// when it does not, so the website and the future mobile app ask one place only.
const cache = new Map()

export function useRoadRoute(stops, { seats = 4, flexible = false, delay = 350 } = {}) {
  const key = JSON.stringify([stops.map((s) => [Number(s.lat).toFixed(5), Number(s.lng).toFixed(5), Number(s.nights ?? 0)]), seats, flexible])
  const [state, setState] = useState({ route: cache.get(key) ?? null, loading: false, error: '' })

  useEffect(() => {
    if (stops.length === 0) return setState({ route: null, loading: false, error: '' })
    if (cache.has(key)) return setState({ route: cache.get(key), loading: false, error: '' })
    let alive = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    const t = setTimeout(() => {
      post('/routes/compute', { stops: stops.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, nights: Number(s.nights ?? 0) })), seats, flexible })
        .then((route) => {
          cache.set(key, route)
          if (alive) setState({ route, loading: false, error: '' })
        })
        .catch((e) => alive && setState({ route: null, loading: false, error: e.message }))
    }, delay)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // key holds everything that matters about stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay])

  return state
}
