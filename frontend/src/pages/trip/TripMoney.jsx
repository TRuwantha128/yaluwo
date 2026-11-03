import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Building2, Check, Copy, CreditCard, Loader2, ShieldCheck } from 'lucide-react'
import { get, post, upload } from '../../api/client'
import { useConfig, settingOf } from '../../config/useConfig'
import { Countdown, FilePick, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import { rs } from '../../lib/format'

// PayHere is a hosted page: the browser posts a signed form to it, so card numbers never reach Yaluwo.
// In test mode (PAYHERE_MODE=simulate) an in-site test page stands in for PayHere.
export function startCheckout(checkout, navigate) {
  if (checkout.simulate) {
    navigate(`/pay/test/${checkout.fields.order_id}`)
    return
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = checkout.action
  for (const [k, v] of Object.entries(checkout.fields)) {
    const i = document.createElement('input')
    i.type = 'hidden'
    i.name = k
    i.value = v
    form.appendChild(i)
  }
  document.body.appendChild(form)
  form.submit()
}

function BankTransfer({ reply, onSent }) {
  const { bank, payment } = reply
  const [f, setF] = useState({ amount: String(payment.amount), paidOn: new Date().toISOString().slice(0, 10), bank: '', bankRef: '', slip: null })
  const a = useAction()
  const config = useConfig()
  const banks = config?.lists?.BANK?.map((b) => b.label_en) ?? []
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-2 p-4 text-sm">
        <p className="font-bold">Pay into Yaluwo's account</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Bank</dt><dd className="font-semibold">{bank.bank}{bank.branch ? `, ${bank.branch}` : ''}</dd>
          <dt className="text-muted">Account name</dt><dd className="font-semibold">{bank.accountName}</dd>
          <dt className="text-muted">Account number</dt><dd className="font-semibold">{bank.accountNumber || 'Set by the admin'}</dd>
          <dt className="text-muted">Amount</dt><dd className="font-semibold">{rs(bank.amount)}</dd>
          <dt className="text-muted">Reference</dt>
          <dd className="flex items-center gap-2 font-mono font-bold text-brand">{bank.reference}<button type="button" onClick={() => navigator.clipboard?.writeText(bank.reference)} aria-label="Copy reference"><Copy className="h-4 w-4" /></button></dd>
        </dl>
        <p className="mt-3 text-xs text-muted">{bank.note} A slip counts only when the money shows in Yaluwo's bank statement (usually 1 working day). Your seat is held meanwhile.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); a.run(async () => { await upload(`/payments/${payment.id}/proof`, f); onSent() }) }} className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount on the slip" error={a.fields.amount}><input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" className={input} /></Field>
        <Field label="Date" error={a.fields.paidOn}><input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} className={input} /></Field>
        <Field label="Your bank" error={a.fields.bank}>
          <input list="banks" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className={input} />
          <datalist id="banks">{banks.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Bank reference" hint="optional"><input value={f.bankRef} onChange={(e) => setF({ ...f, bankRef: e.target.value })} className={input} /></Field>
        <div className="sm:col-span-2"><FilePick label="Photo or PDF of the slip" value={f.slip} onChange={(slip) => setF({ ...f, slip })} /></div>
        {a.error && <Notice tone="danger" className="sm:col-span-2">{a.error}</Notice>}
        <button disabled={a.busy || !f.slip || !f.bank} className={`${btn.primary} sm:col-span-2`}>{a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Send slip</button>
      </form>
    </div>
  )
}

function ChooseMethod({ start, bankAllowed, minDays }) {
  const navigate = useNavigate()
  const [reply, setReply] = useState(null)
  const [sent, setSent] = useState(false)
  const a = useAction()
  if (sent) return <Notice tone="success">Slip sent. We'll match it with our bank statement and tell you when it's approved.</Notice>
  if (reply?.bank) return <BankTransfer reply={reply} onSent={() => setSent(true)} />
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={a.busy} onClick={() => a.run(async () => startCheckout((await start('PAYHERE')).checkout, navigate))} className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line transition hover:ring-brand">
          <CreditCard className="h-6 w-6 shrink-0 text-brand" />
          <span><span className="block font-semibold">Card or wallet</span><span className="block text-xs text-muted">Visa, Mastercard, Amex, Genie, FriMi… through PayHere</span></span>
        </button>
        <button type="button" disabled={a.busy || !bankAllowed} onClick={() => a.run(async () => setReply(await start('BANK_TRANSFER')))} className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line transition hover:ring-brand disabled:opacity-50">
          <Building2 className="h-6 w-6 shrink-0 text-brand" />
          <span><span className="block font-semibold">Bank transfer or deposit slip</span><span className="block text-xs text-muted">{bankAllowed ? 'Checked against our bank statement' : `Only for trips ${minDays}+ days away`}</span></span>
        </button>
      </div>
      {a.busy && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Opening payment…</p>}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
    </div>
  )
}

const daysUntil = (ymd) => Math.round((new Date(`${ymd}T00:00:00`) - new Date(new Date().toDateString())) / 86400000)

// A member's share: what's due, what's paid, and the two ways to pay
export function PayPanel({ trip }) {
  const config = useConfig()
  const m = trip.myMoney
  const minDays = settingOf(config, 'money.slip_min_days_ahead', 5)
  const underReview = trip.myPayments?.find((p) => p.status === 'UNDER_REVIEW')
  if (!m) return null
  const policy = [
    `${settingOf(config, 'cancel.member_full_days', 7)}+ days before: your share back (booking fee kept)`,
    `${settingOf(config, 'cancel.member_half_days', 3)}–${settingOf(config, 'cancel.member_full_days', 7) - 1} days before: ${settingOf(config, 'cancel.member_half_pct', 50)}% back`,
    `Under ${settingOf(config, 'cancel.member_half_days', 3)} days: no refund`,
    'If the organiser, Yaluwo or a partner cancels: 100% back',
  ]
  return (
    <section id="pay" className="scroll-mt-28 rounded-3xl bg-surface p-6 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Your share</h2>
          <p className="mt-1 text-sm text-muted">You pay Yaluwo only your own amount. Yaluwo holds it until the trip ends.</p>
        </div>
        {trip.paymentDueAt && m.balance > 0 && <span className="rounded-full bg-accent-soft px-3 py-1.5 text-sm">Pay by {new Date(trip.paymentDueAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · <Countdown to={trip.paymentDueAt} /></span>}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-muted">Your share</dt><dd className="text-lg font-bold">{rs(m.share)}</dd></div>
        <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-muted">Booking fee</dt><dd className="text-lg font-bold">{rs(m.fee)}</dd></div>
        <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-muted">Paid</dt><dd className="text-lg font-bold">{rs(m.credit)}</dd></div>
        <div className={`rounded-2xl p-3 ${m.balance > 0 ? 'bg-accent-soft' : 'bg-[color-mix(in_oklab,#16a34a_14%,var(--surface))]'}`}><dt className="text-muted">To pay</dt><dd className="text-lg font-bold">{m.balance > 0 ? rs(m.balance) : 'Done'}</dd></div>
      </dl>
      {m.balance > 0 && trip.status === 'PAYMENT_DUE' && (
        <div className="mt-6">
          {underReview ? (
            <Notice>Your bank slip ({underReview.reference}) is being checked. You'll get a message when the money is found in our bank statement.</Notice>
          ) : (
            <ChooseMethod bankAllowed={daysUntil(trip.startDate) >= minDays} minDays={minDays} start={(channel) => post(`/trips/${trip.code}/payments`, { channel })} />
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-brand">Cancellation and refund rules</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{policy.map((p) => <li key={p}>{p}</li>)}</ul>
            <Link to="/legal/cancellation" className="mt-2 inline-block font-semibold text-brand hover:underline">Full policy</Link>
          </details>
        </div>
      )}
      {m.balance <= 0 && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-success"><Check className="h-4 w-4" /> Paid in full. Receipts are in <Link to="/me/payments" className="underline">Payments & refunds</Link>.</p>}
    </section>
  )
}

export function DepositPanel({ code, amount, onPaid }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="font-semibold">2. Pay the {rs(amount)} listing deposit</p>
      <p className="mb-3 text-sm text-muted">Returned when the trip closes with no upheld reports, or straight away if the trip isn't approved.</p>
      <ChooseMethod bankAllowed minDays={0} start={(channel) => post(`/trips/${code}/deposit`, { channel })} />
      {onPaid && <button type="button" onClick={onPaid} className={`${btn.ghost} mt-3`}>I've paid: send for review</button>}
    </div>
  )
}

// Stands in for PayHere when PAYHERE_MODE=simulate (no real money)
export function PaymentTestPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [p, setP] = useState(null)
  const a = useAction()
  useEffect(() => {
    get(`/payments/${orderId}`).then((r) => setP(r.payment))
  }, [orderId])
  if (!p) return <PageLoader />
  const go = (outcome) => a.run(async () => {
    await post(`/payments/${orderId}/simulate`, { outcome })
    navigate(outcome === 'SUCCESS' ? `/pay/return?order=${orderId}` : `/pay/cancelled?order=${orderId}`)
  })
  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-28">
      <div className="rounded-3xl bg-surface p-6 shadow-xl ring-1 ring-line">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">Test payment · no real money</p>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">PayHere checkout (test mode)</h1>
        <p className="mt-1 text-sm text-muted">This page replaces PayHere while PAYHERE_MODE=simulate. It sends a correctly signed notice to the server, exactly like PayHere would.</p>
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Order</dt><dd className="font-mono">{p.orderId}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">For</dt><dd>{p.tripTitle ?? p.purpose}</dd></div>
          <div className="flex justify-between text-base"><dt className="font-semibold">Amount</dt><dd className="font-extrabold">{rs(p.amount)}</dd></div>
        </dl>
        {a.error && <Notice tone="danger" className="mt-4">{a.error}</Notice>}
        <div className="mt-6 grid gap-2">
          <button onClick={() => go('SUCCESS')} disabled={a.busy} className={btn.primary}><ShieldCheck className="h-4 w-4" /> Pay {rs(p.amount)}</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => go('FAIL')} disabled={a.busy} className={btn.ghost}>Card declined</button>
            <button onClick={() => go('CANCEL')} disabled={a.busy} className={btn.ghost}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// PayHere sends people back here. The payment counts only when the server-to-server notice arrives.
export function PaymentReturnPage({ cancelled = false }) {
  const [params] = useSearchParams()
  const order = params.get('order')
  const [p, setP] = useState(null)
  useEffect(() => {
    let tries = 0
    let stop = false
    const poll = async () => {
      const r = await get(`/payments/${order}`).catch(() => null)
      if (stop) return
      setP(r?.payment ?? null)
      if (!cancelled && r?.payment?.status === 'PENDING' && tries++ < 20) setTimeout(poll, 1500)
    }
    poll()
    return () => {
      stop = true
    }
  }, [order, cancelled])
  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-32 text-center">
      {!p ? (
        <PageLoader />
      ) : (
        <div className="rounded-3xl bg-surface p-8 ring-1 ring-line">
          <StatusBadge status={p.status} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{p.status === 'PAID' ? 'Payment received' : cancelled || ['CANCELLED', 'FAILED'].includes(p.status) ? 'Payment not completed' : 'Waiting for PayHere…'}</h1>
          <p className="mt-2 text-sm text-muted">{p.status === 'PAID' ? `Thank you. ${rs(p.amount)} is held by Yaluwo until the trip ends.` : p.status === 'PENDING' ? 'This can take a few seconds.' : 'No money was taken. You can try again from the trip page.'}</p>
          {p.tripCode && <Link to={`/trips/${p.tripCode}#pay`} className={`${btn.primary} mt-6`}>Back to the trip</Link>}
        </div>
      )}
    </div>
  )
}
