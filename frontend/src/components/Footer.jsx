import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Plus, Search } from 'lucide-react'
import { DISTRICT_BY_ID, PLACE_BY_ID, placeUrl } from '../lib/places'
import { describeWeather, useLiveWeather } from '../hooks/useLiveWeather'
import { scrollToY } from '../lib/smoothScroll'

const COLUMNS = [
  ['Explore', [['Find trips', '/trips'], ['All destinations', '/places'], ['How it works', '/#how'], ['Why Yaluwo', '/#why']]],
  ['Travel', [['Create a trip', '/trips/new'], ['My trips', '/me'], ['Messages', '/messages'], ['Log in', '/login']]],
  ['Partners', [['Drive with Yaluwo', '/signup'], ['Hotels and cabanas', '/#partners']]],
  ['Legal', [['Terms of use', '/legal/terms'], ['Privacy notice', '/legal/privacy'], ['Cancellation and refunds', '/legal/cancellation'], ['Community guidelines', '/legal/community']]],
]
const STRIP = ['nine-arch', 'sigiriya', 'mirissa', 'temple-of-the-tooth', 'arugam', 'horton'].map((id) => PLACE_BY_ID[id]).filter((p) => p?.photos?.[0])
const COLOMBO = [PLACE_BY_ID.colombo].filter(Boolean)
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', hour: 'numeric', minute: '2-digit' })

function LocalNow() {
  const [time, setTime] = useState(() => timeFmt.format(new Date()))
  const { data } = useLiveWeather(COLOMBO)
  useEffect(() => {
    const id = setInterval(() => setTime(timeFmt.format(new Date())), 30_000)
    return () => clearInterval(id)
  }, [])
  const w = data.colombo
  const info = w ? describeWeather(w.code) : null
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Colombo {time}
      {info && (
        <>
          <info.Icon className="h-4 w-4" /> {w.temp}°
        </>
      )}
    </span>
  )
}

// A floating card in the colours chosen in the colour box:
// deep shade of the main colour, with a glow of the highlight colour
export default function Footer() {
  return (
    <footer className="px-3 pb-3 pt-10 sm:px-4 sm:pb-4">
      <div
        className="relative isolate overflow-hidden rounded-[32px] text-white md:rounded-[40px]"
        style={{ background: 'linear-gradient(150deg, var(--night) 0%, color-mix(in oklab, var(--brand) 78%, var(--night)) 100%)' }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 -z-10 h-[520px] w-[520px] rounded-full opacity-60 blur-[120px]" style={{ background: 'var(--accent)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 -z-10 h-[460px] w-[460px] rounded-full opacity-25 blur-[120px]" style={{ background: 'var(--sky)' }} />

        <div className="px-6 pt-12 sm:px-10 md:px-14 md:pt-16">
          {/* Headline and the two main actions */}
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Link to="/" className="inline-flex items-center gap-3" aria-label="Yaluwo home">
                <img src="/brand/mark-64.png" alt="" width="40" height="40" className="h-10 w-10 rounded-xl" />
                <span className="font-display text-2xl font-bold tracking-[-0.02em]">yaluwo</span>
              </Link>
              <p className="font-display mt-6 max-w-[16ch] text-[clamp(2.2rem,4.6vw,4rem)] font-bold leading-[0.98]">Travel Sri Lanka together.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/trips/new" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 font-semibold text-night transition hover:bg-white/90">
                <Plus className="h-5 w-5" /> Create a trip
              </Link>
              <Link to="/trips" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3.5 font-semibold ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20">
                <Search className="h-5 w-5" /> Find trips
              </Link>
            </div>
          </div>

          {/* Places to go: a strip of real photos */}
          <ul className="scrollbar-none -mx-6 mt-12 flex snap-x gap-3 overflow-x-auto px-6 sm:-mx-10 sm:px-10 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0">
            {STRIP.map((p) => (
              <li key={p.id} className="w-40 shrink-0 snap-start md:w-auto">
                <Link to={placeUrl(p)} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-white/10" style={{ backgroundColor: p.photos[0].c }}>
                  <img src={p.photos[0].sm} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                  <span className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.6),transparent_55%)]" />
                  <span className="absolute inset-x-3 bottom-3">
                    <span className="block text-xs text-white/70">{DISTRICT_BY_ID[p.district]?.name}</span>
                    <span className="block font-semibold leading-tight">{p.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Links */}
          <div className="mt-14 grid gap-10 border-t border-white/15 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
            <p className="max-w-[36ch] leading-relaxed text-white/70">Plan a route, travel with verified people, share one driver and pay only your own part. Money is held safely until the trip is done.</p>
            <nav className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4" aria-label="Footer">
              {COLUMNS.map(([title, links]) => (
                <div key={title}>
                  <p className="text-sm font-semibold">{title}</p>
                  <ul className="mt-4 space-y-3 text-[15px] text-white/65">
                    {links.map(([label, to]) => (
                      <li key={label}>
                        <Link to={to} className="transition-colors hover:text-white">{label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 px-6 py-6 text-sm text-white/60 sm:px-10 md:px-14">
          <p>© {new Date().getFullYear()} Yaluwo. Made in Sri Lanka.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <LocalNow />
            <span>English</span>
            <span>Rs LKR</span>
            <span>Payments by PayHere</span>
            <button onClick={() => scrollToY(0)} aria-label="Back to top" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
