import { env } from '../config/env.js'
import { bad, unavailable } from '../lib/errors.js'

// The trip-planning helper. A traveller describes the trip they want in their own words
// ("5 days, hills and one beach, not too much driving") and gets back a route made only
// from places Yaluwo knows. The website sends the place list; the model may only pick from it.
// Needs ANTHROPIC_API_KEY. Without it the website does not show the helper.
const SYSTEM = `You plan group road trips in Sri Lanka for the Yaluwo website.
Reply with ONE JSON object and nothing else:
{"title": string (max 60 characters), "stops": [{"id": string, "nights": integer}], "why": string (max 240 characters, plain words)}
Rules:
- Use only place ids from the list you are given. Never invent a place.
- 2 to 7 stops, in a sensible driving order with no backtracking. The first stop is where the trip starts and has nights 0.
- Total nights must fit the number of days the traveller asks for (days minus 1). If they give no length, plan 3 to 5 days.
- Keep each day's drive under about 5 hours. Sri Lankan roads are slow: about 35 km per hour.
- Respect the season if a month is given: the south and west coasts are best December to April, the east coast May to September.
- If the request is not about a trip in Sri Lanka, return {"title": "", "stops": [], "why": "one short sentence saying what you can help with"}.`

export async function planTrip({ prompt, places }) {
  if (!env.aiKey) throw unavailable('The trip helper is not switched on.')
  const list = places.map((p) => `${p.id} | ${p.name} | ${p.district} | ${p.kind} | ${p.lat.toFixed(2)},${p.lng.toFixed(2)}`).join('\n')
  let res
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.aiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.aiModel,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Places (id | name | district | kind | lat,lng):\n${list}\n\nThe traveller wrote:\n"""${prompt}"""` }],
      }),
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    throw unavailable('The trip helper took too long. Try again.')
  }
  if (!res.ok) {
    console.error('Trip helper failed:', res.status, (await res.text()).slice(0, 300))
    throw unavailable('The trip helper is not available right now.')
  }
  const json = await res.json()
  const text = json.content?.find((c) => c.type === 'text')?.text ?? ''
  let plan
  try {
    plan = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    throw unavailable('The trip helper gave an answer we could not read. Try again.')
  }
  // Never trust the answer: keep only real places, sane nights
  const known = new Map(places.map((p) => [p.id, p]))
  const stops = (Array.isArray(plan.stops) ? plan.stops : [])
    .filter((s) => known.has(s?.id))
    .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i)
    .slice(0, 8)
    .map((s, i) => ({ id: s.id, nights: i === 0 ? 0 : Math.min(10, Math.max(0, Math.round(Number(s.nights) || 0))) }))
  if (stops.length < 2) throw bad(String(plan.why || 'Tell me where you want to go, for how many days, and what you like.').slice(0, 300))
  return { title: String(plan.title ?? '').slice(0, 70), stops, why: String(plan.why ?? '').slice(0, 300) }
}
