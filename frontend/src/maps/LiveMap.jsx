import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// A real, zoomable map of Sri Lanka with no API key: OpenStreetMap data drawn by MapLibre,
// tiles from OpenFreeMap. It shows numbered stops, the road line between them, and a
// round photo pin for each place.
//
// stops:  [{ name, lat, lng }]            numbered in order
// line:   [[lng, lat], ...]               the road to draw (see lib/polyline.js)
// places: [{ id, name, lat, lng, photo }] photo pins; picked ones get a coloured ring
const STYLE = import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty'
const SRI_LANKA = [[79.45, 5.85], [82.0, 9.9]]

const emptyLine = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }

export default function LiveMap({ stops = [], line = null, places = [], picked = [], onPlaceClick, padding = 60, pitch = 0, intro = false, cooperative = true, zoom = 11, className = '' }) {
  const box = useRef(null)
  const map = useRef(null)
  const stopMarkers = useRef([])
  const placeMarkers = useRef(new Map())
  const click = useRef(onPlaceClick)
  click.current = onPlaceClick
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // ----- create the map once -----
  useEffect(() => {
    let m
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: STYLE,
        bounds: SRI_LANKA,
        fitBoundsOptions: { padding: 30 },
        pitch: intro ? 0 : pitch,
        maxPitch: 60,
        minZoom: 5.5,
        maxBounds: [[76.5, 3.5], [85, 12]],
        cooperativeGestures: cooperative,
        attributionControl: { compact: true },
      })
    } catch {
      setFailed(true)
      return
    }
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: emptyLine })
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } })
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2e3192', 'line-width': 5 } })
      setReady(true)
    })
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
    // the map is created once; later changes go through the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- photo pins -----
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const wanted = new Set(places.map((p) => p.id ?? `${p.lat},${p.lng}`))
    for (const [id, marker] of placeMarkers.current) {
      if (!wanted.has(id)) {
        marker.remove()
        placeMarkers.current.delete(id)
      }
    }
    for (const p of places) {
      const id = p.id ?? `${p.lat},${p.lng}`
      let marker = placeMarkers.current.get(id)
      if (!marker) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'ylw-pin'
        el.title = p.name
        el.setAttribute('aria-label', p.name)
        if (p.photo) el.style.backgroundImage = `url("${p.photo}")`
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          click.current?.(p)
        })
        marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m)
        placeMarkers.current.set(id, marker)
      }
      marker.getElement().classList.toggle('is-picked', picked.includes(id))
    }
  }, [places, picked, ready])

  // ----- stops, the road line, and the camera -----
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    stopMarkers.current.forEach((x) => x.remove())
    stopMarkers.current = stops.map((s, i) => {
      const el = document.createElement('div')
      el.className = 'ylw-stop'
      el.textContent = String(i + 1)
      el.title = s.name
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([Number(s.lng), Number(s.lat)]).addTo(m)
    })
    const coords = line?.length > 1 ? line : stops.map((s) => [Number(s.lng), Number(s.lat)])
    m.getSource('route')?.setData(coords.length > 1 ? { ...emptyLine, geometry: { type: 'LineString', coordinates: coords } } : emptyLine)

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pad = typeof padding === 'number' ? padding : { top: 60, bottom: 60, left: 60, right: 60, ...padding }
    if (coords.length > 1) {
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      m.fitBounds(b, { padding: pad, pitch, maxZoom: 12.5, duration: still ? 0 : 1400 })
    } else if (stops.length === 1) {
      m.easeTo({ center: [Number(stops[0].lng), Number(stops[0].lat)], zoom, pitch, padding: pad, duration: still ? 0 : 1200 })
    } else if (places.length === 1) {
      m.easeTo({ center: [places[0].lng, places[0].lat], zoom, pitch, duration: 0 })
    } else if (places.length > 1 && !intro) {
      const b = places.reduce((acc, p) => acc.extend([p.lng, p.lat]), new maplibregl.LngLatBounds([places[0].lng, places[0].lat], [places[0].lng, places[0].lat]))
      m.fitBounds(b, { padding: pad, pitch, maxZoom: 12, duration: 0 })
    } else {
      // Nothing chosen yet: the whole island, tilted. On the home page this is the opening move.
      m.fitBounds(SRI_LANKA, { padding: pad, pitch, bearing: intro ? -8 : 0, duration: still ? 0 : intro ? 2600 : 900 })
    }
    // stops and line are compared by content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops.map((s) => [s.lat, s.lng])), line?.length, ready, JSON.stringify(padding), places.length])

  return (
    <div className={`relative overflow-hidden bg-[#dfe7f2] ${className}`}>
      {/* inline style: the map library sets position: relative on its container */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {failed && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">The map can't be drawn on this device (it needs WebGL). The route and prices still work.</p>}
    </div>
  )
}
