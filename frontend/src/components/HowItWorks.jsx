import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'

// A real sequence, so the steps are numbered; the dotted line is the route between them
const STEPS = [
  { title: 'Plan your route', text: 'Add every place in order and choose the nights at each stop. Drive times and a fair price appear as you go.' },
  { title: 'Publish it', text: 'Set the seats. Verified travellers who like your route ask to join, and you chat before you decide.' },
  { title: 'Book a driver', text: 'Drivers send offers. Accept one and everyone pays only their own share, held safely by Yaluwo.' },
  { title: 'Go together', text: 'Check in on the day, travel, and rate each other after. The driver is paid when the trip is done.' },
]

export default function HowItWorks() {
  return (
    <section id="how" className="wrap scroll-mt-24 py-20 md:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-[18ch] text-[clamp(2rem,4.2vw,3.4rem)] font-bold leading-[1.02]">From an idea to a full van in four steps</h2>
        <Link to="/trips/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg transition hover:opacity-90">
          <Plus className="h-4 w-4" /> Plan a trip
        </Link>
      </div>
      <ol className="relative mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <span aria-hidden className="absolute left-0 right-0 top-[22px] hidden border-t-2 border-dotted border-accent/50 lg:block" />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="font-display relative grid h-11 w-11 place-items-center rounded-full bg-accent text-lg font-bold text-on-accent ring-8 ring-bg">{i + 1}</span>
            <h3 className="font-display mt-6 text-xl font-bold">{s.title}</h3>
            <p className="mt-2 max-w-[34ch] leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
