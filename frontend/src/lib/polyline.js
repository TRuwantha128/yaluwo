// Decodes an encoded polyline (the format both Google and OSRM send) into [lng, lat] pairs
export function decodePolyline(text, precision = 5) {
  const factor = 10 ** precision
  const out = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < text.length) {
    for (const axis of [0, 1]) {
      let shift = 0
      let result = 0
      let byte
      do {
        byte = text.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    out.push([lng / factor, lat / factor])
  }
  return out
}

// The line to draw for a computed route: real road geometry when the API sent it,
// otherwise straight lines between the stops
export function routeLine(route, stops) {
  try {
    if (route?.polyline) return decodePolyline(route.polyline)
    const parts = (route?.legs ?? []).map((l) => l.polyline).filter(Boolean)
    if (parts.length && parts.length === (route.legs ?? []).length) return parts.flatMap((p) => decodePolyline(p))
  } catch {
    /* fall through to straight lines */
  }
  return stops.map((s) => [Number(s.lng), Number(s.lat)])
}
