import { Link } from 'react-router-dom'
import { Logo } from './ui'

const COLUMNS = {
  Travel: [
    ['Find trips', '/trips'],
    ['Create a trip', '/trips/new'],
    ['Destinations', '/places'],
    ['What it costs', '/#share'],
  ],
  Yaluwo: [
    ['Safety', '/#safety'],
    ['Drive with Yaluwo', '/signup?role=DRIVER'],
    ['Log in', '/login'],
  ],
  Legal: [
    ['Terms of use', '/legal/terms'],
    ['Privacy notice', '/legal/privacy'],
    ['Cancellation and refunds', '/legal/cancellation'],
    ['Community guidelines', '/legal/community'],
  ],
}

export default function Footer() {
  return (
    <footer className="bg-night text-white">
      <div className="relative wrap grid gap-10 px-4 pb-14 pt-16 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <Logo light size="h-11" />
          <p className="mt-5 max-w-xs text-white/65">Group travel across Sri Lanka, with people who have shown who they are.</p>
          <p className="mt-6 text-sm text-white/65">In an emergency on the road: Police 119, Suwa Seriya ambulance 1990.</p>
        </div>
        {Object.entries(COLUMNS).map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-bold text-white/50">{title}</p>
            <ul className="mt-4 space-y-3 text-white/80">
              {links.map(([label, to]) => (
                <li key={label}><Link to={to} className="transition hover:text-mango">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="wrap border-t border-white/10 py-6 text-sm text-white/45">© {new Date().getFullYear()} Yaluwo. Made in Sri Lanka.</p>
    </footer>
  )
}
