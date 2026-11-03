import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Car, Clock, Languages, ShieldCheck, Star, Snowflake } from 'lucide-react'
import { get, post } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { Notice, PageLoader, useAction } from '../components/form'
import { Avatar, btn } from '../components/ui'

const Stars = ({ value }) => (value ? <span className="inline-flex items-center gap-1 font-bold"><Star className="h-4 w-4 fill-accent text-accent" /> {Number(value).toFixed(1)}</span> : <span className="text-sm text-muted">New</span>)

function ReviewList({ reviews }) {
  if (!reviews?.length) return <p className="text-sm text-muted">No reviews yet. Reviews appear once both sides have rated, or after 14 days.</p>
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between text-sm"><span className="font-semibold">{r.by}</span><Stars value={r.overall} /></div>
          <p className="text-xs text-muted">{r.tag}</p>
          {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
          {r.photos?.length > 0 && <div className="mt-2 flex gap-2">{r.photos.map((u) => <img key={u} src={u} alt="" className="h-16 w-16 rounded-xl object-cover" />)}</div>}
        </li>
      ))}
    </ul>
  )
}

const Head = ({ photo, name, children }) => (
  <div className="flex flex-wrap items-center gap-5">
    {photo ? <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-surface" /> : <Avatar name={name} size="h-24 w-24 text-2xl" />}
    <div>{children}</div>
  </div>
)

// Public driver profile (workflow section 5): verified badges, vehicles, blind reviews
export function DriverProfile() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get(`/drivers/${id}`).then(setD).catch((e) => setError(e.message))
  }, [id])
  if (error) return <div className="mx-auto max-w-3xl px-4 pt-32"><Notice tone="danger">{error}</Notice></div>
  if (!d) return <PageLoader />
  const v = d.driver
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-28">
      <Head photo={v.photo} name={v.name}>
        <h1 className="text-3xl font-extrabold tracking-tight">{v.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <Stars value={v.rating} /> <span className="text-muted">{v.reviews} reviews · {v.tripsCompleted} trips</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {v.verified && <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-brand"><BadgeCheck className="h-3.5 w-3.5" /> ID checked</span>}
          {v.licenceBadge && <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-brand"><Car className="h-3.5 w-3.5" /> Licence checked</span>}
          {v.policeBadge && <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-brand"><ShieldCheck className="h-3.5 w-3.5" /> Police report</span>}
          {v.badges.map((b) => <span key={b} className="rounded-full bg-accent-soft px-3 py-1">{b}</span>)}
        </div>
      </Head>
      <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted">
        {v.languages.length > 0 && <span className="inline-flex items-center gap-1.5"><Languages className="h-4 w-4" /> {v.languages.join(', ')}</span>}
        {v.yearsDriving && <span className="inline-flex items-center gap-1.5"><Car className="h-4 w-4" /> {v.yearsDriving} years driving</span>}
        {v.replyMinutes && <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> Replies in about {v.replyMinutes} min</span>}
      </div>
      {v.bio && <p className="mt-4 max-w-2xl">{v.bio}</p>}

      <h2 className="mt-10 text-xl font-bold">Vehicles</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {v.vehicles.map((x) => (
          <div key={x.id} className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
            <div className="scrollbar-none flex snap-x gap-1 overflow-x-auto">
              {x.photos.map((p) => <img key={p.url} src={p.url} alt={p.angle} className="aspect-[4/3] w-full shrink-0 snap-center object-cover" />)}
              {x.photos.length === 0 && <div className="grid aspect-[4/3] w-full place-items-center bg-surface-2 text-muted"><Car className="h-10 w-10" /></div>}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between"><p className="font-bold">{x.name} {x.year && <span className="font-normal text-muted">· {x.year}</span>}</p><Stars value={x.rating} /></div>
              <p className="mt-1 flex items-center gap-3 text-sm text-muted">{x.type} · {x.seats} seats {x.ac && <span className="inline-flex items-center gap-1"><Snowflake className="h-3.5 w-3.5" /> A/C</span>}</p>
              {d.reviews.vehicles[x.id]?.length > 0 && <div className="mt-3"><ReviewList reviews={d.reviews.vehicles[x.id].slice(0, 3)} /></div>}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">What travellers said</h2>
      <div className="mt-3"><ReviewList reviews={d.reviews.driver} /></div>
    </div>
  )
}

export function PersonProfile() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get(`/people/${id}`).then(setD).catch((e) => setError(e.message))
  }, [id])
  if (error) return <div className="mx-auto max-w-3xl px-4 pt-32"><Notice tone="danger">{error}</Notice></div>
  if (!d) return <PageLoader />
  const p = d.person
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
      <Head photo={p.photo} name={p.firstName}>
        <h1 className="text-3xl font-extrabold tracking-tight">{p.firstName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm"><Stars value={p.rating} /><span className="text-muted">{p.reviews} reviews · {p.tripsCompleted} trips</span>{p.verified && <span className="inline-flex items-center gap-1 font-semibold text-brand"><BadgeCheck className="h-4 w-4" /> ID checked</span>}</div>
      </Head>
      {p.bio && <p className="mt-6">{p.bio}</p>}
      <h2 className="mt-10 text-xl font-bold">Reviews from trip mates</h2>
      <div className="mt-3"><ReviewList reviews={d.reviews} /></div>
    </div>
  )
}

// Legal text: lines starting with # are headings, blank lines split paragraphs
function LegalBody({ body }) {
  return (
    <div className="space-y-4 leading-relaxed">
      {body.split(/\n{2,}/).map((block, i) => {
        const h = block.match(/^(#{1,3})\s+(.*)/)
        if (h) return <h2 key={i} className={`${h[1].length === 1 ? 'text-2xl' : 'text-lg'} pt-2 font-bold`}>{h[2]}</h2>
        if (/^[-*] /m.test(block)) return <ul key={i} className="list-disc space-y-1 pl-6">{block.split('\n').map((l) => <li key={l}>{l.replace(/^[-*]\s+/, '')}</li>)}</ul>
        return <p key={i} className="whitespace-pre-line">{block}</p>
      })}
    </div>
  )
}

export function LegalPage() {
  const { slug } = useParams()
  const [page, setPage] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setPage(null)
    get(`/legal/${slug}`).then(setPage).catch((e) => setError(e.message))
  }, [slug])
  if (error) return <div className="mx-auto max-w-3xl px-4 pt-32"><Notice tone="danger">{error}</Notice></div>
  if (!page) return <PageLoader />
  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-28">
      <p className="text-sm text-muted">Version {page.version}{page.publishedAt ? ` · ${new Date(page.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}` : ''}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{page.title}</h1>
      <div className="mt-8"><LegalBody body={page.body.replace(/^#\s+.*\n+/, '')} /></div>
    </article>
  )
}

// When terms change, a logged-in person accepts the new version before going on (section 22)
export function ConsentGate() {
  const { user } = useAuth()
  const [pages, setPages] = useState([])
  const [ticked, setTicked] = useState(false)
  const a = useAction()
  useEffect(() => {
    if (!user || user.isAdmin) return setPages([])
    get('/me').then((r) => setPages(r.mustAccept ?? [])).catch(() => null)
  }, [user])
  if (!pages.length) return null
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-line">
        <h2 className="text-xl font-bold">We've updated our terms</h2>
        <p className="mt-2 text-sm text-muted">Please read and accept the new version to keep using Yaluwo.</p>
        <ul className="mt-4 space-y-2 text-sm">{pages.map((p) => <li key={p.slug}><Link to={`/legal/${p.slug}`} target="_blank" className="font-semibold text-brand hover:underline">{p.title}</Link> <span className="text-muted">(version {p.version})</span></li>)}</ul>
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-ui)]" /> I have read and accept these.</label>
        {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
        <button disabled={!ticked || a.busy} onClick={() => a.run(async () => { await post('/me/consents', { pages: pages.map(({ slug, version }) => ({ slug, version })) }); setPages([]) })} className={`${btn.primary} mt-5 w-full justify-center`}>Accept and continue</button>
      </div>
    </div>
  )
}
