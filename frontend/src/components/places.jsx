import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { Cover } from './ui'
import { DISTRICT_BY_ID, coverOf, placeUrl } from '../lib/places'
import { tripPicks, useTripPicks, pickKey } from '../hooks/useTripPicks'

// A photo from public/media/destinations. Shows the photo's own colour while it loads.
export function Photo({ photo, alt = '', large = false, className = '', eager = false }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={large ? photo.src : photo.sm}
      alt={alt}
      width={photo.w}
      height={photo.h}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      style={{ backgroundColor: photo.c }}
      className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}

// Cover photo of a place, or its illustration if it has no photos yet
export function PlaceCover({ place, large = false, className = '', eager = false }) {
  const photo = coverOf(place)
  if (!photo) return <Cover kind={place.kind} alt={place.name} className={className} />
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: photo.c }}>
      <Photo photo={photo} alt={place.name} large={large} eager={eager} className={className} />
    </div>
  )
}

export function usePicked(place) {
  const picks = useTripPicks()
  return picks.some((p) => p.key === pickKey(place))
}

// Select / unselect a place for the next trip
export function PickButton({ place, size = 'md', className = '' }) {
  const picked = usePicked(place)
  const small = size === 'sm'
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        tripPicks.toggle(place)
      }}
      aria-pressed={picked}
      aria-label={picked ? `Remove ${place.name} from your trip` : `Select ${place.name} for your trip`}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold shadow-sm transition ${
        small ? 'h-9 px-3 text-xs' : 'h-11 px-5 text-sm'
      } ${picked ? 'bg-accent text-on-accent' : 'bg-white/95 text-[#0e1726] ring-1 ring-black/5 hover:bg-white'} ${className}`}
    >
      {picked ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {picked ? 'Selected' : 'Select'}
    </motion.button>
  )
}

// Card for one place: photo, name, tags and a Select button
export function PlaceCard({ place, showDistrict = false, onHover }) {
  const picked = usePicked(place)
  const count = place.photos.length
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
      onMouseEnter={() => onHover?.(place.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group relative overflow-hidden rounded-3xl bg-surface ring-1 transition ${picked ? 'ring-2 ring-accent' : 'ring-line hover:ring-ink/20'}`}
    >
      <Link to={placeUrl(place)} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <PlaceCover place={place} className="transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          {count > 1 && <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{count} photos</span>}
          {count === 0 && <span className="absolute bottom-3 left-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">No photo yet</span>}
        </div>
        <div className="p-4 pr-5">
          {showDistrict && <p className="text-xs font-semibold text-muted">{DISTRICT_BY_ID[place.district].name} District</p>}
          <h3 className="text-lg font-extrabold leading-snug tracking-tight">{place.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{place.about}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {place.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
      </Link>
      <PickButton place={place} size="sm" className="absolute right-3 top-3" />
    </motion.article>
  )
}

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm font-medium text-muted">
      {items.map(([label, to], i) => (
        <span key={label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {to ? (
            <Link to={to} className="hover:text-ink">
              {label}
            </Link>
          ) : (
            <span className="text-ink">{label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
