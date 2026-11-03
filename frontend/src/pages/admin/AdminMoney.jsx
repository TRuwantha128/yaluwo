import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, ExternalLink, Upload } from 'lucide-react'
import { download, get, post, upload } from '../../api/client'
import { Countdown, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import { rs } from '../../lib/format'
import { PageTitle } from './AdminShell'

const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const TABS = [['incoming', 'Incoming'], ['slips', 'Slips to check'], ['settlements', 'Settlements'], ['held', 'Held'], ['ready', 'Ready'], ['batches', 'Sent and paid'], ['refunds', 'Refunds'], ['chargebacks', 'Chargebacks'], ['revenue', 'Revenue']]

function Table({ head, rows, empty = 'Nothing here' }) {
  return (
    <div className="overflow-x-auto rounded-3xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={head.length} className="px-4 py-8 text-center text-muted">{empty}</td></tr> : rows}</tbody>
      </table>
    </div>
  )
}
const Td = ({ children, className = '' }) => <td className={`border-t border-line px-4 py-3 ${className}`}>{children}</td>

function Incoming() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    get('/admin/payments').then((r) => setRows(r.payments))
  }, [])
  if (!rows) return <PageLoader />
  return <Table head={['Date', 'Trip', 'Payer', 'Amount', 'Method', 'PayHere ID / reference', 'Status']} rows={rows.map((p) => <tr key={p.id}><Td>{when(p.date)}</Td><Td className="font-mono text-xs">{p.trip}</Td><Td>{p.payer}</Td><Td className="font-semibold">{rs(p.amount)}</Td><Td>{p.method}</Td><Td className="font-mono text-xs">{p.ref}</Td><Td><StatusBadge status={p.status} />{p.settledOn && <span className="block text-xs text-muted">settles {p.settledOn}</span>}</Td></tr>)} />
}

function Slips() {
  const [d, setD] = useState(null)
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [reason, setReason] = useState({})
  const a = useAction()
  const load = () => get('/admin/slips').then(setD)
  useEffect(() => {
    load()
  }, [])
  if (!d) return <PageLoader />
  const act = (fn) => a.run(async () => { await fn(); load() })
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <p className="font-bold">Upload today's bank statement (CSV)</p>
        <p className="text-sm text-muted">A slip counts only when its money is in the statement. Lines are matched by the reference (YLW-…-M3) and amount. The same line can't be imported twice.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button disabled={!file || a.busy} onClick={() => a.run(async () => { setResult(await upload('/admin/bank-statements', { statement: file })); load() })} className={btn.primary}><Upload className="h-4 w-4" /> Import</button>
        </div>
        {result && <Notice tone="success" className="mt-3">{result.added} new lines, {result.duplicates} already imported, {result.matched} slips matched.</Notice>}
      </div>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {d.slips.length === 0 ? <Notice tone="success">No slips waiting.</Notice> : d.slips.map((s) => (
        <div key={s.id} className="grid gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line lg:grid-cols-[200px_1fr_1fr_auto]">
          <a href={s.file} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-surface-2">{/\.pdf/.test(s.file) ? <span className="grid h-40 place-items-center font-semibold">PDF <ExternalLink className="h-4 w-4" /></span> : <img src={s.file} alt="Slip" className="h-40 w-full object-cover" />}</a>
          <div className="text-sm">
            <p className="font-bold">Slip · {s.payer}</p>
            <p className="font-mono text-brand">{s.reference}</p>
            <p>Due <b>{rs(s.due)}</b> · entered {rs(s.entered)}</p>
            <p>{s.bank} · {s.paidOn}{s.bankRef ? ` · ref ${s.bankRef}` : ''}</p>
            <p className="text-xs text-muted">sent {when(s.submittedAt)}</p>
          </div>
          <div className={`rounded-2xl p-3 text-sm ${s.line ? (Number(s.line.amount) >= Number(s.due) ? 'bg-[color-mix(in_oklab,#16a34a_12%,var(--surface))]' : 'bg-accent-soft') : 'bg-surface-2'}`}>
            <p className="font-bold">Bank statement</p>
            {s.line ? (
              <><p>{s.line.date} · <b>{rs(s.line.amount)}</b></p><p className="text-xs">{s.line.description}</p></>
            ) : (
              <>
                <p className="text-muted">No matching money yet.</p>
                {d.unmatchedLines.length > 0 && (
                  <select onChange={(e) => e.target.value && act(() => post(`/admin/slips/${s.id}/match`, { lineId: Number(e.target.value) }))} className="mt-2 w-full rounded-xl bg-surface px-2 py-1.5 text-xs ring-1 ring-line" defaultValue="">
                    <option value="">Link a line by hand…</option>
                    {d.unmatchedLines.map((l) => <option key={l.id} value={l.id}>{l.date} · {rs(l.amount)} · {l.description.slice(0, 40)}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button disabled={!s.line} onClick={() => act(() => post(`/admin/slips/${s.id}/approve`))} className={`${btn.primary} !py-2 text-sm`}>Approve</button>
            <button disabled={!s.line || Number(s.line?.amount) >= Number(s.due)} onClick={() => act(() => post(`/admin/slips/${s.id}/ask-balance`))} className={`${btn.ghost} !py-2 text-sm`}>Ask for balance</button>
            <input value={reason[s.id] ?? ''} onChange={(e) => setReason({ ...reason, [s.id]: e.target.value })} placeholder="Reason to reject" className="rounded-xl bg-surface-2 px-3 py-1.5 text-xs" />
            <button disabled={(reason[s.id] ?? '').length < 5} onClick={() => act(() => post(`/admin/slips/${s.id}/reject`, { reason: reason[s.id] }))} className={`${btn.ghost} !py-2 text-sm text-danger`}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Settlements() {
  const [rows, setRows] = useState(null)
  const [f, setF] = useState({})
  const a = useAction()
  const load = () => get('/admin/settlements').then((r) => setRows(r.days))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <p className="mb-3 text-sm text-muted">PayHere pays Yaluwo's bank two working days after each payment (minus its fee). Record each bank credit to match it.</p>
      {a.error && <Notice tone="danger" className="mb-3">{a.error}</Notice>}
      <Table head={['Settles on', 'Payments', 'Expected', 'Bank credit', '']} rows={rows.map((d) => (
        <tr key={d.date}>
          <Td>{d.date}{!d.arrived && <span className="block text-xs text-muted">not yet</span>}</Td><Td>{d.payments}</Td><Td className="font-semibold">{rs(d.expected)}</Td>
          <Td>{d.bankCredit != null ? <>{rs(d.bankCredit)} {d.matched ? <StatusBadge status="APPROVED" /> : <StatusBadge status="FAILED" />}</> : <input value={f[d.date] ?? ''} onChange={(e) => setF({ ...f, [d.date]: e.target.value })} placeholder="Amount received" className="w-36 rounded-xl bg-surface-2 px-3 py-1.5" />}</Td>
          <Td>{d.bankCredit == null && <button disabled={!f[d.date]} onClick={() => a.run(async () => { await post('/admin/settlements', { date: d.date, bankCredit: Number(f[d.date]) }); load() })} className={`${btn.ghost} !py-1.5 text-sm`}>Record</button>}</Td>
        </tr>
      ))} />
    </div>
  )
}

function Held() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    get('/admin/held').then((r) => setRows(r.held))
  }, [])
  if (!rows) return <PageLoader />
  return <Table head={['Trip', 'Trip status', 'Partner', 'Amount', 'Status']} rows={rows.map((h, i) => <tr key={i}><Td><span className="font-mono text-xs">{h.code}</span> {h.title}</Td><Td><StatusBadge status={h.trip_status} /></Td><Td>{h.full_name}</Td><Td className="font-semibold">{rs(h.amount)}</Td><Td><StatusBadge status={h.status} /></Td></tr>)} empty="No money held" />
}

function Ready() {
  const [rows, setRows] = useState(null)
  const [chosen, setChosen] = useState([])
  const [batch, setBatch] = useState(null)
  const a = useAction()
  const load = () => get('/admin/payouts', { status: 'READY' }).then((r) => { setRows(r.payouts); setChosen([]) })
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  const total = rows.filter((p) => chosen.includes(p.id)).reduce((s, p) => s + Number(p.net), 0)
  return (
    <div>
      {batch && <Notice tone="success" className="mb-4">Batch {batch.code}: {batch.count} payouts, {rs(batch.total)}{batch.skipped ? ` (${batch.skipped} skipped: no verified account or paused)` : ''}. Download the bank file in "Sent and paid", upload it in internet banking, then enter the batch reference.</Notice>}
      {a.error && <Notice tone="danger" className="mb-4">{a.error}</Notice>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button disabled={!chosen.length || a.busy} onClick={() => a.run(async () => { setBatch(await post('/admin/payouts/release', { ids: chosen })); load() })} className={btn.accent}>Release selected ({rs(total)})</button>
        <span className="text-sm text-muted">Batches over the step-up limit ask for your password and code.</span>
      </div>
      <Table head={['', 'Partner', 'Trip', 'Type', 'Gross', 'Commission', 'Net', 'Account']} rows={rows.map((p) => (
        <tr key={p.id}>
          <Td><input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} aria-label={`Select payout ${p.id}`} className="h-4 w-4 accent-[var(--brand-ui)]" /></Td>
          <Td className="font-semibold">{p.partner}</Td><Td className="font-mono text-xs">{p.trip}</Td><Td>{p.kind === 'FUEL_ADVANCE' ? 'Fuel advance' : 'Booking'}</Td>
          <Td>{rs(p.gross)}</Td><Td>{rs(p.commission)}</Td><Td className="font-bold">{rs(p.net)}</Td><Td className="text-xs">{p.account}</Td>
        </tr>
      ))} empty="No payouts are ready" />
    </div>
  )
}

function Batches() {
  const [batches, setBatches] = useState(null)
  const [sent, setSent] = useState([])
  const [ref, setRef] = useState({})
  const a = useAction()
  const load = () => Promise.all([get('/admin/payout-batches'), get('/admin/payouts', { status: 'APPROVED,SENT,PAID,FAILED' })]).then(([b, p]) => { setBatches(b.batches); setSent(p.payouts) })
  useEffect(() => {
    load()
  }, [])
  if (!batches) return <PageLoader />
  const act = (fn) => a.run(async () => { await fn(); load() })
  return (
    <div className="space-y-4">
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {batches.length === 0 && <Notice>No batches yet.</Notice>}
      {batches.map((b) => (
        <div key={b.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-bold">{b.code} · {b.count} payouts · {rs(b.total)}</p><p className="text-xs text-muted">{when(b.createdAt)}{b.bankRef ? ` · bank ref ${b.bankRef}` : ''}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              <button onClick={() => download(`/admin/payout-batches/${b.id}/file`, `${b.code}.csv`)} className={`${btn.ghost} !py-1.5 text-sm`}><Download className="h-4 w-4" /> Bank file</button>
              {b.status === 'APPROVED' && (
                <>
                  <input value={ref[b.id] ?? ''} onChange={(e) => setRef({ ...ref, [b.id]: e.target.value })} placeholder="Batch reference from the bank" className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm" />
                  <button disabled={(ref[b.id] ?? '').length < 3} onClick={() => act(() => post(`/admin/payout-batches/${b.id}/sent`, { bankRef: ref[b.id] }))} className={`${btn.primary} !py-1.5 text-sm`}>Mark sent</button>
                </>
              )}
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {sent.filter((p) => p.batch === b.code).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <span>{p.partner} · {rs(p.net)} · {p.account}</span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  {p.status === 'SENT' && <><button onClick={() => act(() => post(`/admin/payouts/${p.id}/paid`))} className="text-xs font-semibold text-success">Paid</button><button onClick={() => act(() => post(`/admin/payouts/${p.id}/failed`, { reason: 'Bank returned the transfer' }))} className="text-xs font-semibold text-danger">Failed</button></>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Refunds() {
  const [rows, setRows] = useState(null)
  const [ref, setRef] = useState({})
  const a = useAction()
  const load = () => get('/admin/refunds').then((r) => setRows(r.refunds))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Card refunds: refund in the PayHere portal (or Refund API) using the PayHere ID, then enter its reference. Slip refunds: transfer to an account in the payer's name.</p>
      {a.error && <Notice tone="danger" className="mb-3">{a.error}</Notice>}
      <Table head={['Payer', 'Trip', 'Amount', 'Method', 'Reason', 'PayHere ID', '']} rows={rows.map((x) => (
        <tr key={x.id}>
          <Td>{x.payer}</Td><Td className="font-mono text-xs">{x.trip}</Td><Td className="font-semibold">{rs(x.amount)}</Td><Td>{x.method === 'PAYHERE' ? 'Card' : 'Bank'}</Td><Td className="text-xs">{x.reason}</Td><Td className="font-mono text-xs">{x.payhereId}</Td>
          <Td><span className="flex gap-2"><input value={ref[x.id] ?? ''} onChange={(e) => setRef({ ...ref, [x.id]: e.target.value })} placeholder="Reference" className="w-28 rounded-xl bg-surface-2 px-2 py-1 text-xs" /><button disabled={(ref[x.id] ?? '').length < 3} onClick={() => a.run(async () => { await post(`/admin/refunds/${x.id}/processed`, { reference: ref[x.id] }); load() })} className="text-xs font-semibold text-brand">Done</button></span></Td>
        </tr>
      ))} empty="No refunds waiting" />
    </div>
  )
}

function Chargebacks() {
  const [rows, setRows] = useState(null)
  const a = useAction()
  const load = () => get('/admin/chargebacks').then((r) => setRows(r.chargebacks))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return <Table head={['Order', 'Trip', 'Amount', 'Received', 'Status', '']} rows={rows.map((c) => <tr key={c.id}><Td className="font-mono text-xs">{c.order_id}</Td><Td className="font-mono text-xs">{c.trip_code}</Td><Td className="font-semibold">{rs(c.amount)}</Td><Td>{c.received_on}</Td><Td><StatusBadge status={c.status} /></Td><Td><span className="flex gap-2">{['EVIDENCE_SENT', 'WON', 'LOST'].map((o) => <button key={o} onClick={() => a.run(async () => { await post(`/admin/chargebacks/${c.id}/outcome`, { outcome: o }); load() })} className="text-xs font-semibold text-brand">{o.replace('_', ' ').toLowerCase()}</button>)}</span></Td></tr>)} empty="No chargebacks" />
}

function Revenue() {
  const [d, setD] = useState(null)
  useEffect(() => {
    get('/admin/revenue').then(setD)
  }, [])
  if (!d) return <PageLoader />
  return (
    <div>
      <p className="mb-3 text-sm">Held for partners right now: <b>{rs(d.heldForPartners)}</b></p>
      <Table head={['Month', 'Booking fees', 'Commission', 'Ads', 'Total']} rows={d.months.map((m) => <tr key={m.month}><Td>{m.month}</Td><Td>{rs(m.bookingFees)}</Td><Td>{rs(m.commission)}</Td><Td>{rs(m.ads)}</Td><Td className="font-bold">{rs(m.total)}</Td></tr>)} empty="No revenue yet" />
    </div>
  )
}

export function AdminPayments() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'incoming'
  const View = { incoming: Incoming, slips: Slips, settlements: Settlements, held: Held, ready: Ready, batches: Batches, refunds: Refunds, chargebacks: Chargebacks, revenue: Revenue }[tab] ?? Incoming
  return (
    <div>
      <PageTitle title="Payments and payouts" text="Money comes in by PayHere or bank slip, and leaves only when you release it." />
      <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setParams({ tab: k })} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line'}`}>{l}</button>)}</div>
      <View />
    </div>
  )
}

// ---------- Disputes ----------
export function AdminDisputes() {
  const [rows, setRows] = useState(null)
  const [f, setF] = useState({})
  const a = useAction()
  const load = () => get('/admin/disputes').then((r) => setRows(r.disputes))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <PageTitle title="Disputes" text="Decide within 72 hours: release in full, partial refund, or full refund. A lost dispute is a strike for the partner." />
      {a.error && <Notice tone="danger" className="mb-4">{a.error}</Notice>}
      {rows.length === 0 ? <Notice tone="success">No open disputes.</Notice> : rows.map((d) => {
        const v = f[d.id] ?? { decision: 'RELEASE', refundAmount: '', note: '' }
        const set = (k) => (e) => setF({ ...f, [d.id]: { ...v, [k]: e.target.value } })
        return (
          <div key={d.id} className="mb-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-bold">{d.code} · {d.booking} · {rs(d.amount)}</p><span className="flex items-center gap-2"><StatusBadge status={d.status} /><Countdown to={d.adminDueAt} className="text-xs" /></span></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-2 p-3 text-sm"><p className="font-semibold">{d.openedBy} (traveller)</p><p>{d.reason}</p>{d.evidence.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-2 text-xs font-semibold text-brand">evidence</a>)}</div>
              <div className="rounded-2xl bg-surface-2 p-3 text-sm"><p className="font-semibold">{d.partner} (partner)</p><p>{d.response ?? <span className="text-muted">No reply yet (<Countdown to={d.partnerDueAt} />)</span>}</p>{d.partnerEvidence.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-2 text-xs font-semibold text-brand">evidence</a>)}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[180px_160px_1fr_auto] sm:items-end">
              <Field label="Decision"><select value={v.decision} onChange={set('decision')} className={input}><option value="RELEASE">Release in full</option><option value="PARTIAL">Partial refund</option><option value="REFUND">Full refund</option></select></Field>
              {v.decision === 'PARTIAL' ? <Field label="Refund (Rs)"><input value={v.refundAmount} onChange={set('refundAmount')} inputMode="numeric" className={input} /></Field> : <span />}
              <Field label="Note to both sides"><input value={v.note} onChange={set('note')} className={input} /></Field>
              <button disabled={v.note.length < 5} onClick={() => a.run(async () => { await post(`/admin/disputes/${d.id}/decide`, { ...v, refundAmount: v.refundAmount ? Number(v.refundAmount) : undefined }); load() })} className={btn.primary}>Decide</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
