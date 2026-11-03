import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { get, openFile } from '../../api/client'
import { PageLoader, StatusBadge } from '../../components/form'
import { rs } from '../../lib/format'

export default function Payments() {
  const [data, setData] = useState(null)
  useEffect(() => {
    get('/me/payments').then(setData)
  }, [])
  if (!data) return <PageLoader />
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-28">
      <h1 className="text-3xl font-extrabold tracking-tight">Payments and refunds</h1>
      <p className="mt-1 text-muted">Yaluwo holds your payment until the trip ends, then pays the partners.</p>

      <section className="mt-8 overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-4 py-3">Trip</th><th className="px-4 py-3">Amount</th><th className="hidden px-4 py-3 sm:table-cell">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {data.payments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No payments yet</td></tr>}
            {data.payments.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3">
                  {p.tripCode ? <Link to={`/trips/${p.tripCode}`} className="font-semibold hover:underline">{p.trip}</Link> : p.purpose}
                  <p className="text-xs text-muted">{p.orderId}{p.purpose === 'DEPOSIT' ? ' · listing deposit' : ''}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{rs(p.amount)}{Number(p.refunded) > 0 && <p className="text-xs font-normal text-muted">{rs(p.refunded)} refunded</p>}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{p.channel === 'PAYHERE' ? 'Card / wallet' : 'Bank transfer'}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-right">
                  {p.receipt && (
                    <button onClick={() => openFile(`/payments/${p.id}/receipt.pdf`)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                      <FileText className="h-4 w-4" /> Receipt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <h2 className="mt-12 text-xl font-extrabold tracking-tight">Refunds</h2>
      <div className="mt-4 space-y-2">
        {data.refunds.length === 0 && <p className="text-sm text-muted">No refunds.</p>}
        {data.refunds.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div>
              <p className="font-semibold">{rs(x.amount)}</p>
              <p className="text-sm text-muted">{x.reason}</p>
            </div>
            <div className="text-right">
              <StatusBadge status={x.status} />
              <p className="mt-1 text-xs text-muted">{x.method === 'PAYHERE' ? 'Card refunds take several working days' : 'Sent by bank transfer with the next batch'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
