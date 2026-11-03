import { FEATURED } from '../lib/places'

export default function Marquee() {
  const names = FEATURED.map((p) => p.name)
  return (
    <section className="overflow-hidden border-y border-line bg-surface py-5" aria-hidden="true">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {[...names, ...names].map((name, i) => (
          <span key={i} className="flex items-center gap-8 text-2xl font-extrabold tracking-tight text-ink/80 md:text-3xl">
            {name}
            <span className="h-2 w-2 rounded-full bg-accent" />
          </span>
        ))}
      </div>
    </section>
  )
}
