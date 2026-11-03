import { useEffect, useState } from 'react'
import { get } from '../api/client'

// Prices, fees, deadlines and lists come from the API (GET /config), never from code
let cache = null
let pending = null

export function loadConfig() {
  if (cache) return Promise.resolve(cache)
  pending ??= get('/config').then((c) => (cache = c)).finally(() => (pending = null))
  return pending
}

export function useConfig() {
  const [config, setConfig] = useState(cache)
  useEffect(() => {
    if (!cache) loadConfig().then(setConfig).catch(() => setConfig(null))
  }, [])
  return config
}

export const settingOf = (config, key, fallback = null) => config?.settings?.[key] ?? fallback
export const vehicleName = (config, code) => config?.rateCard?.vehicles?.find((v) => v.code === code)?.name ?? code
