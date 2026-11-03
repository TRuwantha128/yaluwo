import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { DISTRICT_SHAPES, MAP_VIEWBOX, project } from '../lib/districtShapes'
import { DISTRICTS, DISTRICT_BY_ID, placesIn } from '../lib/places'

const [VX, VY, VW, VH] = MAP_VIEWBOX.split(' ').map(Number)
const pct = ([x, y]) => ({ left: `${((x - VX) / VW) * 100}%`, top: `${((y - VY) / VH) * 100}%` })

// Clickable map of the 25 districts.
// active: the district under the pointer (or the card being hovered), focus: the district this page is about.
export default function DistrictMap({ active = null, focus = null, onHover, onSelect, pins = [], showCounts = true, className = '' }) {
  const reduce = useReducedMotion()
  const counts = useMemo(() => Object.fromEntries(DISTRICTS.map((d) => [d.id, placesIn(d.id).length])), [])
  const max = Math.max(...Object.values(counts))
  const label = active ?? focus
  const shown = label ? DISTRICT_BY_ID[label] : null

  const fillOpacity = (id) => {
    if (id === active) return 1
    if (focus) return id === focus ? 0.9 : 0.12
    return 0.16 + (counts[id] / max) * 0.42
  }

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={MAP_VIEWBOX} className="h-full w-full overflow-visible" role="group" aria-label="Map of Sri Lanka's districts">
        {DISTRICTS.map((d, i) => {
          const isActive = d.id === active
          return (
            <motion.path
              key={d.id}
              d={DISTRICT_SHAPES[d.id].d}
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : 0.02 * i, duration: 0.5 }}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
              fill={isActive ? 'var(--accent)' : 'var(--brand-ui)'}
              fillOpacity={fillOpacity(d.id)}
              stroke="var(--surface)"
              strokeWidth={isActive || d.id === focus ? 1.4 : 0.8}
              strokeLinejoin="round"
              className={onSelect ? 'cursor-pointer outline-none transition-[fill,fill-opacity] duration-200 focus-visible:fill-[var(--accent)]' : ''}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'link' : undefined}
              aria-label={onSelect ? `${d.name} district, ${counts[d.id]} places` : undefined}
              onMouseEnter={() => onHover?.(d.id)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(d.id)}
              onBlur={() => onHover?.(null)}
              onClick={() => onSelect?.(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(d.id)
                }
              }}
            />
          )
        })}
        {pins.map((p) => {
          const [x, y] = project(p.lat, p.lng)
          return <circle key={p.id ?? p.name} cx={x} cy={y} r={2.6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1} pointerEvents="none" />
        })}
      </svg>

      {shown && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-bg shadow-lg"
          style={pct(DISTRICT_SHAPES[shown.id].label)}
        >
          {shown.name}
          {showCounts && <span className="ml-1.5 font-medium opacity-70">{counts[shown.id]} places</span>}
        </div>
      )}
    </div>
  )
}
