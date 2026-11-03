import { useEffect, useState } from 'react'
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudLightning } from 'lucide-react'

// Free weather API, no key needed: https://open-meteo.com
export function useLiveWeather(places) {
  const [state, setState] = useState({ data: {}, error: false })

  useEffect(() => {
    const lat = places.map((p) => p.lat).join(',')
    const lng = places.map((p) => p.lng).join(',')
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Asia%2FColombo`

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : [json]
        const data = {}
        list.forEach((r, i) => {
          data[places[i].id] = { temp: Math.round(r.current.temperature_2m), code: r.current.weather_code }
        })
        setState({ data, error: false })
      })
      .catch(() => setState({ data: {}, error: true }))
  }, [places])

  return state
}

export function describeWeather(code) {
  if (code === 0) return { label: 'Clear', Icon: Sun }
  if (code <= 2) return { label: 'Sunny spells', Icon: CloudSun }
  if (code === 3) return { label: 'Cloudy', Icon: Cloud }
  if (code === 45 || code === 48) return { label: 'Misty', Icon: CloudFog, mist: true }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle, rain: true }
  if (code >= 95) return { label: 'Storm', Icon: CloudLightning, rain: true }
  return { label: 'Rain', Icon: CloudRain, rain: true }
}
