import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, post, put } from '../../api/client'
import { Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import { rs } from '../../lib/format'
import { PageTitle } from './AdminShell'

const GROUPS = { fees: 'Platform fees', rates: 'Rate-card rules', deadlines: 'Deadlines and limits', quality: 'Quality', money_safety: 'Money safety', settings: 'Notice periods' }

function SettingRow({ s, onSaved, notice }) {
  const [value, setValue] = useState(typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value))
  const [from, setFrom] = useState('')
  const a = useAction()
  const isObj = typeof s.value === 'object' && !Array.isArray(s.value)
  const days = s.group === 'fees' ? notice.fees : s.group === 'rates' ? notice.rates : 0
  const parsed = () => {
    if (typeof s.value === 'number') return Number(value)
    if (Array.isArray(s.value) || isObj) return JSON.parse(value)
    return value
  }
  return (
    <li className="grid gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line md:grid-cols-[1fr_220px_160px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold">{s.label}</p>
        <p className="font-mono text-[11px] text-muted">{s.key} · v{s.version}{s.min != null ? ` · ${s.min}–${s.max}` : ''}{days ? ` · ${days} days' notice` : ''}{s.needsStepUp ? ' · needs confirmation' : ''}</p>
      </div>
      {isObj ? <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs" /> : <div className="flex items-center gap-2"><input value={value} onChange={(e) => setValue(e.target.value)} className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm" />{s.unit && <span className="text-xs text-muted">{s.unit}</span>}</div>}
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm" aria-label="Starts on" title="Starts on (empty = as soon as allowed)" />
      <button onClick={() => a.run(async () => { await put(`/admin/settings/${s.key}`, { value: parsed(), effectiveFrom: from || undefined }); onSaved() })} className={`${btn.ghost} !py-2 text-sm`}>Save</button>
      {a.error && <p className="text-xs text-danger md:col-span-4">{a.error}</p>}
    </li>
  )
}

function Settings() {
  const [d, setD] = useState(null)
  const load = () => get('/admin/settings').then(setD)
  useEffect(() => {
    load()
  }, [])
  if (!d) return <PageLoader />
  return (
    <div className="space-y-8">
      <Notice>Every change is a new version, never an edit. Fee changes give partners {d.notice.fees} days' notice, rate cards {d.notice.rates}. Existing bookings keep their price.</Notice>
      {d.scheduled.length > 0 && <div className="rounded-3xl bg-accent-soft p-5"><p className="font-bold">Scheduled changes</p>{d.scheduled.map((s) => <p key={`${s.key}${s.version}`} className="text-sm">{s.label}: {JSON.stringify(s.value)} from {new Date(s.effectiveFrom).toLocaleDateString('en-GB')}</p>)}</div>}
      {Object.entries(GROUPS).map(([g, label]) => (
        <section key={g}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{label}</h2>
          <ul className="space-y-2">{d.settings.filter((s) => s.group === g).map((s) => <SettingRow key={s.key} s={s} notice={d.notice} onSaved={load} />)}</ul>
        </section>
      ))}
    </div>
  )
}

function RateCards() {
  const [cards, setCards] = useState(null)
  const [draft, setDraft] = useState(null)
  const [impact, setImpact] = useState({})
  const [start, setStart] = useState('')
  const a = useAction()
  const load = () => get('/admin/rate-cards').then((r) => setCards(r.cards))
  useEffect(() => {
    load()
  }, [])
  if (!cards) return <PageLoader />
  const active = cards.find((c) => c.status === 'ACTIVE')
  const newDraft = () => setDraft(active.rates.map((r) => ({ vehicleTypeId: r.vehicle_type_id, name: r.name_en, ratePerKm: r.rate_per_km, dayMinimum: r.day_minimum, dailyRate: r.daily_rate, dailyKm: r.daily_km, selfdriveDaily: r.selfdrive_daily, selfdriveKm: r.selfdrive_km, deposit: r.deposit, driverAllowance: r.driver_allowance, emptyReturnPct: r.empty_return_pct })))
  const cols = [['ratePerKm', 'Per km'], ['dayMinimum', 'Day minimum'], ['dailyRate', 'Flexible daily'], ['dailyKm', 'Daily km'], ['driverAllowance', 'Driver night'], ['emptyReturnPct', 'Empty return %']]
  return (
    <div className="space-y-6">
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {!draft && <button onClick={newDraft} className={btn.primary}>New rate card version</button>}
      {draft && (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-bold">Draft, copied from v{active.version}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Type</th>{cols.map(([, l]) => <th key={l} className="px-2 py-2">{l}</th>)}</tr></thead>
              <tbody>{draft.map((r, i) => <tr key={r.vehicleTypeId}><td className="py-1 font-semibold">{r.name}</td>{cols.map(([k]) => <td key={k} className="px-2 py-1"><input value={r[k] ?? ''} onChange={(e) => setDraft(draft.map((x, n) => (n === i ? { ...x, [k]: e.target.value } : x)))} className="h-9 w-24 rounded-lg bg-surface-2 px-2" /></td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setDraft(null)} className={btn.ghost}>Discard</button>
            <button onClick={() => a.run(async () => { await post('/admin/rate-cards', { rates: draft.map(({ name: _n, ...x }) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === '' || v == null ? null : Number(v)]))) }); setDraft(null); load() })} className={btn.primary}>Save draft</button>
          </div>
        </div>
      )}
      {cards.map((c) => (
        <div key={c.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold">Rate card v{c.version} {c.effectiveFrom && <span className="font-normal text-muted">· from {new Date(c.effectiveFrom).toLocaleDateString('en-GB')}</span>}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={c.status} />
              {c.status === 'DRAFT' && <><button onClick={() => a.run(async () => setImpact({ ...impact, [c.id]: await get(`/admin/rate-cards/${c.id}/impact`) }))} className={`${btn.ghost} !py-1.5 text-sm`}>See impact</button><button onClick={() => a.run(async () => { await post(`/admin/rate-cards/${c.id}/approve`); load() })} className={`${btn.primary} !py-1.5 text-sm`}>Approve</button></>}
              {c.status === 'APPROVED' && <><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm" /><button disabled={!start} onClick={() => a.run(async () => { await post(`/admin/rate-cards/${c.id}/schedule`, { startDate: start }); load() })} className={`${btn.primary} !py-1.5 text-sm`}>Schedule</button></>}
            </div>
          </div>
          {impact[c.id] && <Notice className="mt-3">{impact[c.id].partnersAffected} partners and {impact[c.id].openTrips} open trips affected. {impact[c.id].changes.map((x) => `${x.type}: per km ${x.ratePerKm.pct ?? 0}%`).join(' · ')}. {impact[c.id].note}</Notice>}
          <div className="mt-3 overflow-x-auto text-sm"><table className="w-full"><tbody>{c.rates.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-2 font-semibold">{r.name_en}</td><td>{rs(r.rate_per_km)}/km</td><td>{rs(r.day_minimum)} day min</td><td>{rs(r.daily_rate)} flexible</td><td>{rs(r.driver_allowance)} night</td><td>{r.empty_return_pct}% return</td></tr>)}</tbody></table></div>
        </div>
      ))}
    </div>
  )
}

function Lists() {
  const [d, setD] = useState(null)
  const [f, setF] = useState({ list: 'TRIP_TAG', label: '' })
  const [vt, setVt] = useState({ name: '', maxPassengers: '' })
  const a = useAction()
  const load = () => get('/admin/lookups').then(setD)
  useEffect(() => {
    load()
  }, [])
  if (!d) return <PageLoader />
  const lists = [...new Set(d.lookups.map((l) => l.list))]
  return (
    <div className="space-y-6">
      <Notice>Lists are not code: add an entry and it appears on the site at once. Entries are switched off, never deleted.</Notice>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <div className="flex flex-wrap items-end gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <Field label="List"><select value={f.list} onChange={(e) => setF({ ...f, list: e.target.value })} className={input}>{lists.map((l) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="New entry"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={input} /></Field>
        <button disabled={!f.label} onClick={() => a.run(async () => { await post('/admin/lookups', f); setF({ ...f, label: '' }); load() })} className={btn.primary}>Add</button>
      </div>
      {lists.map((l) => (
        <section key={l}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{l.replace(/_/g, ' ')}</h2>
          <div className="flex flex-wrap gap-2">{d.lookups.filter((x) => x.list === l).map((x) => <button key={x.id} onClick={() => a.run(async () => { await put(`/admin/lookups/${x.id}`, { active: !x.active }); load() })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${x.active ? 'bg-surface ring-1 ring-line' : 'bg-surface-2 text-muted line-through'}`} title={x.active ? 'Switch off' : 'Switch on'}>{x.label_en}</button>)}</div>
        </section>
      ))}
      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 className="font-bold">Vehicle types</h2>
        <ul className="mt-2 space-y-1 text-sm">{d.vehicleTypes.map((t) => <li key={t.id} className="flex items-center justify-between"><span>{t.name_en} · up to {t.max_passengers} · licence {t.licence_class}</span><button onClick={() => a.run(async () => { await put(`/admin/vehicle-types/${t.id}`, { active: !t.active }); load() })} className="text-xs font-semibold text-brand">{t.active ? 'Switch off' : 'Switch on'}</button></li>)}</ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="New type"><input value={vt.name} onChange={(e) => setVt({ ...vt, name: e.target.value })} className={input} /></Field>
          <Field label="Max passengers"><input value={vt.maxPassengers} onChange={(e) => setVt({ ...vt, maxPassengers: e.target.value })} className={input} /></Field>
          <button disabled={!vt.name || !vt.maxPassengers} onClick={() => a.run(async () => { await post('/admin/vehicle-types', { ...vt, maxPassengers: Number(vt.maxPassengers) }); setVt({ name: '', maxPassengers: '' }); load() })} className={btn.primary}>Add type</button>
        </div>
        <p className="mt-2 text-xs text-muted">Add its prices in a new rate card version before drivers of this type can be priced.</p>
      </section>
    </div>
  )
}

function Legal() {
  const [pages, setPages] = useState(null)
  const [edit, setEdit] = useState(null)
  const a = useAction()
  const load = () => get('/admin/legal').then((r) => setPages(r.pages))
  useEffect(() => {
    load()
  }, [])
  if (!pages) return <PageLoader />
  const latest = Object.values(pages.reduce((m, p) => ({ ...m, [p.slug]: m[p.slug] ?? p }), {}))
  return (
    <div className="space-y-4">
      <Notice tone="warning">A lawyer should review these before real money moves. Publishing a new version asks every user to accept it at their next login.</Notice>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {latest.map((p) => (
        <div key={p.slug} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex items-center justify-between"><p className="font-bold">{p.title} <span className="font-normal text-muted">v{p.version}</span></p><button onClick={() => setEdit({ slug: p.slug, title: p.title, body: p.body, mustAccept: Boolean(p.must_accept) })} className="text-sm font-semibold text-brand">New version</button></div>
          {edit?.slug === p.slug && (
            <div className="mt-3 space-y-2">
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={input} />
              <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={12} className={`${input} h-auto py-3 font-mono text-xs`} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.mustAccept} onChange={(e) => setEdit({ ...edit, mustAccept: e.target.checked })} /> Users must accept it again</label>
              <div className="flex gap-2"><button onClick={() => setEdit(null)} className={btn.ghost}>Cancel</button><button onClick={() => a.run(async () => { await post(`/admin/legal/${edit.slug}`, edit); setEdit(null); load() })} className={btn.primary}>Publish</button></div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AdminSettings() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'settings'
  const View = { settings: Settings, rates: RateCards, lists: Lists, legal: Legal }[tab]
  return (
    <div>
      <PageTitle title="Settings and rates" text="Nothing is hard-coded: every price, fee, deadline and list is here." />
      <div className="mb-6 flex gap-2">{[['settings', 'Settings'], ['rates', 'Rate cards'], ['lists', 'Lists'], ['legal', 'Legal pages']].map(([k, l]) => <button key={k} onClick={() => setParams({ tab: k })} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line'}`}>{l}</button>)}</div>
      <View />
    </div>
  )
}
