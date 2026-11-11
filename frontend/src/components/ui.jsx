import { useState } from 'react'
import { Link } from 'react-router-dom'
import { initials } from '../lib/format'

// Avatar colours follow the theme
const AVATAR_TONES = ['bg-brand text-on-brand', 'bg-mango text-night', 'bg-lagoon text-night', 'bg-orchid text-white', 'bg-coral text-night']

export function Avatar({ name = '', i = 0, size = 'h-8 w-8 text-xs', ring = true }) {
  return (
    <span
      title={name}
      className={`${size} ${AVATAR_TONES[i % AVATAR_TONES.length]} inline-flex shrink-0 items-center justify-center rounded-full font-bold ${ring ? 'ring-2 ring-surface' : ''}`}
    >
      {initials(name) || '?'}
    </span>
  )
}

export function EmptySeat({ size = 'h-8 w-8' }) {
  return <span className={`${size} shrink-0 rounded-full border-2 border-dashed border-line bg-surface`} />
}

// A small marker above a section title: a mango tick and a plain-case label
export function Eyebrow({ children, light = false }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-sm font-semibold ${light ? 'text-white/80' : 'text-brand'}`}>
      <span className="h-[3px] w-7 rounded-full bg-accent" />
      {children}
    </span>
  )
}

export function SectionTitle({ eyebrow, title, text, className = '', light = false }) {
  return (
    <div className={className}>
      {eyebrow && <Eyebrow light={light}>{eyebrow}</Eyebrow>}
      <h2 className={`display mt-4 max-w-3xl text-[clamp(1.7rem,3.6vw,2.9rem)] ${light ? 'text-white' : ''}`}>{title}</h2>
      {text && <p className={`mt-4 max-w-xl text-lg leading-relaxed ${light ? 'text-white/70' : 'text-muted'}`}>{text}</p>}
    </div>
  )
}

// The suitcase from the logo, with the name set in the lettering's sunset gradient
export function Logo({ light = false, size = 'h-9' }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Yaluwo home">
      {/* On dark surfaces the indigo handle needs a white tile behind it */}
      <span className={light ? 'rounded-xl bg-white px-1.5 py-1' : ''}><img src="/brand/mark.png" alt="" className={`${light ? 'h-7' : size} w-auto`} /></span>
      <span className={`font-display text-[1.15rem] font-bold tracking-[-0.04em] ${light ? 'text-white' : 'ink-sunset'}`}>yaluwo</span>
    </Link>
  )
}

const BTN = 'inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-50'
export const btn = {
  primary: `${BTN} bg-brand text-on-brand hover:bg-brand-strong hover:text-white`,
  accent: `${BTN} bg-accent text-on-accent hover:bg-accent-strong`,
  ghost: `${BTN} bg-surface text-ink ring-1 ring-line hover:ring-ink/40`,
  // On the dark indigo sections
  glass: `${BTN} bg-white/10 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20`,
}

// Simple illustrations, tinted with the theme colour, shown until a real photo exists
const ART = {
  hills: (
    <>
      <circle cx="228" cy="44" r="16" fill="white" fillOpacity=".5" />
      <path d="M0 112 L52 64 L96 92 L150 40 L206 94 L252 62 L300 100 V160 H0Z" fill="white" fillOpacity=".16" />
      <path d="M0 134 Q60 98 120 124 T240 114 T300 122 V160 H0Z" fill="white" fillOpacity=".22" />
    </>
  ),
  beach: (
    <>
      <circle cx="150" cy="92" r="28" fill="white" fillOpacity=".45" />
      <path d="M0 106 Q37 96 75 106 T150 106 T225 106 T300 106 V160 H0Z" fill="white" fillOpacity=".16" />
      <path d="M0 126 Q37 114 75 126 T150 126 T225 126 T300 126 V160 H0Z" fill="white" fillOpacity=".22" />
      <path d="M0 146 Q37 136 75 146 T150 146 T225 146 T300 146 V160 H0Z" fill="white" fillOpacity=".28" />
    </>
  ),
  culture: (
    <>
      <circle cx="232" cy="42" r="14" fill="white" fillOpacity=".45" />
      <path d="M150 28 L153 58 Q185 70 192 112 H108 Q115 70 147 58Z" fill="white" fillOpacity=".22" />
      <rect x="96" y="112" width="108" height="10" fill="white" fillOpacity=".22" />
      <path d="M0 140 Q80 124 150 136 T300 132 V160 H0Z" fill="white" fillOpacity=".24" />
    </>
  ),
  city: (
    <>
      <circle cx="68" cy="44" r="14" fill="white" fillOpacity=".45" />
      <path d="M40 160 V108 h22 v52 M72 160 V84 h26 v76 M108 160 V96 h20 v64 M138 160 V64 h28 v96 M176 160 V100 h22 v60 M208 160 V80 h26 v80 M244 160 V112 h20 v48" fill="white" fillOpacity=".2" />
      <path d="M0 146 Q75 136 150 146 T300 142 V160 H0Z" fill="white" fillOpacity=".24" />
    </>
  ),
  wildlife: (
    <>
      <circle cx="228" cy="46" r="16" fill="white" fillOpacity=".45" />
      <path d="M30 160 V120 Q30 100 50 96 Q70 100 70 120 V160 M220 160 V110 Q220 86 244 82 Q268 86 268 110 V160" fill="white" fillOpacity=".18" />
      <path d="M0 138 Q70 118 150 132 T300 126 V160 H0Z" fill="white" fillOpacity=".24" />
    </>
  ),
}

export function Cover({ src, kind = 'hills', alt = '', className = '', children }) {
  const [ok, setOk] = useState(true)
  return (
    <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br from-brand to-brand-strong ${className}`}>
      {(!src || !ok) && (
        <svg viewBox="0 0 300 160" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
          {ART[kind] ?? ART.hills}
        </svg>
      )}
      {src && ok && <img src={src} alt={alt} onError={() => setOk(false)} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      {children}
    </div>
  )
}

// Plays a video only if the file exists; otherwise renders nothing
export function OptionalVideo({ src, poster, className = '' }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <video
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      onLoadedData={() => setReady(true)}
      onError={() => setFailed(true)}
      className={`transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}
