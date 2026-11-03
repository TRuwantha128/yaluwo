import { PLACE_BY_ID } from '../lib/places'

// Photographic page header: a real place, a big title, and an optional panel
// (search, filters) that overlaps the bottom edge
export default function PageHero({ place = 'horton', photo = 0, title, text, children, className = '' }) {
  const img = PLACE_BY_ID[place]?.photos?.[photo] ?? PLACE_BY_ID[place]?.photos?.[0]
  return (
    <section className={`relative ${className}`}>
      <div className="relative isolate flex min-h-[380px] items-end overflow-hidden md:min-h-[440px]" style={{ backgroundColor: img?.c ?? '#1b1f4a' }}>
        {img && <img src={img.src} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--night)_78%,transparent)_0%,color-mix(in_oklab,var(--night)_40%,transparent)_55%,color-mix(in_oklab,var(--night)_15%,transparent)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(0deg,color-mix(in_oklab,var(--night)_60%,transparent),transparent)]" />
        <div className={`wrap pt-32 ${children ? 'pb-24' : 'pb-12'}`}>
          <h1 className="max-w-[16ch] text-[clamp(2.6rem,6.4vw,5.2rem)] font-bold leading-[0.95] text-white">{title}</h1>
          {text && <p className="mt-4 max-w-[52ch] text-lg text-white/85">{text}</p>}
        </div>
      </div>
      {children && <div className="wrap relative z-10 -mt-12">{children}</div>}
    </section>
  )
}
