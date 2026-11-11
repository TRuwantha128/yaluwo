import { BadgeCheck, Landmark, ScanFace } from 'lucide-react'
import { PLACE_BY_ID } from '../../lib/places'

// Two-column frame for sign-up and login: the form, and a night panel with one of the site's photos
export default function AuthShell({ title, text, children, photo = 'nine-arch', wide = false }) {
  const p = PLACE_BY_ID[photo]?.photos[0]
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col px-4 pb-12 pt-28 sm:px-8 lg:px-16">
        <div className={`mx-auto w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <h1 className="text-[clamp(1.7rem,3.4vw,2.5rem)]">{title}</h1>
          {text && <p className="mt-3 text-lg text-muted">{text}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-night text-white lg:block">
        {p && <img src={p.src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/30" />
        <p aria-hidden lang="si" className="font-sinhala pointer-events-none absolute -right-6 top-24 select-none text-[9rem] font-black leading-none text-white/10">යාළුවෝ</p>
        <div className="absolute inset-x-12 bottom-14">
          <p className="display max-w-sm text-3xl">Travel with people who have shown who they are.</p>
          <ul className="mt-8 space-y-4 text-white/85">
            <li className="flex items-center gap-3"><ScanFace className="h-5 w-5 text-mango" /> ID and a live selfie, checked by a person</li>
            <li className="flex items-center gap-3"><Landmark className="h-5 w-5 text-mango" /> Money held until the trip is done</li>
            <li className="flex items-center gap-3"><BadgeCheck className="h-5 w-5 text-mango" /> Registered drivers and vehicles</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
