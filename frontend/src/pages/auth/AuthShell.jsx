import { PLACE_BY_ID } from '../../lib/places'
import { Logo } from '../../components/ui'

// Two-column frame for sign-up and login: the form, and one of your photos
export default function AuthShell({ title, text, children, photo = 'nine-arch' }) {
  const p = PLACE_BY_ID[photo]?.photos[0]
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 pb-10 pt-28 sm:px-8 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
          {text && <p className="mt-2 text-muted">{text}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden lg:block" style={{ backgroundColor: p?.c }}>
        {p && <img src={p.src} alt={PLACE_BY_ID[photo].name} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
        <div className="absolute inset-x-10 bottom-10 text-white">
          <Logo light />
          <p className="mt-3 max-w-sm text-lg font-semibold">Plan a route, fill the seats with verified people, and travel Sri Lanka together.</p>
        </div>
      </div>
    </div>
  )
}
