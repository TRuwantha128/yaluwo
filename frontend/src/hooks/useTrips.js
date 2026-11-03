import { useCallback, useEffect, useState } from 'react'
import { getTrip, listTrips } from '../api/trips'
import { useLive } from '../auth/AuthProvider'

export function useTrips(filters = {}) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState({ trips: [], loading: true, error: '' })
  const load = useCallback(() => {
    listTrips(JSON.parse(key))
      .then((trips) => setState({ trips, loading: false, error: '' }))
      .catch((e) => setState({ trips: [], loading: false, error: e.message }))
  }, [key])
  useEffect(() => {
    load()
  }, [load])
  return { ...state, reload: load }
}

// One trip; reloads itself when the trip changes (live update from the API)
export function useTrip(code) {
  const [state, setState] = useState({ trip: null, loading: true, error: '' })
  const load = useCallback(() => {
    getTrip(code)
      .then((trip) => setState({ trip, loading: false, error: '' }))
      .catch((e) => setState((s) => ({ trip: s.trip, loading: false, error: e.status === 404 ? 'NOT_FOUND' : e.message })))
  }, [code])
  useEffect(() => {
    setState({ trip: null, loading: true, error: '' })
    load()
  }, [load])
  useLive((type, data) => {
    if (type === 'trip' && data.code === code) load()
  })
  return { ...state, reload: load }
}
