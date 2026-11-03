import { useEffect, useRef, useState } from 'react'
import { Flag, ImagePlus, Loader2, Lock, MapPin, Send } from 'lucide-react'
import { get, post, upload } from '../api/client'
import { useAuth, useLive } from '../auth/AuthProvider'
import { Notice } from './form'

const time = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// One chat thread. Phone numbers, emails and links stay hidden until the trip is Confirmed.
export default function Chat({ threadId, className = '', compact = false }) {
  const { user, setUnread } = useAuth()
  const [data, setData] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const list = useRef(null)

  const load = () => get(`/threads/${threadId}/messages`).then((d) => setData(d)).catch((e) => setError(e.message))
  useEffect(() => {
    setData(null)
    load()
  }, [threadId])
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [data?.messages?.length])
  useLive((type, m) => {
    if (type !== 'message' || String(m.threadId) !== String(threadId)) return
    setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d))
    setUnread((u) => ({ ...u, messages: Math.max(0, u.messages - 1) }))
  })

  const send = async (extra = {}) => {
    if (!text.trim() && !extra.photos && extra.lat == null) return
    setBusy(true)
    setError('')
    try {
      const r = await upload(`/threads/${threadId}/messages`, { content: text, ...extra })
      setData((d) => (d.messages.some((x) => x.id === r.message.id) ? d : { ...d, messages: [...d.messages, r.message] }))
      setText('')
      setWarning(r.contactHidden ? 'Contact details are hidden from the others until the trip is confirmed. Keep payments inside Yaluwo.' : '')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const shareLocation = () =>
    navigator.geolocation?.getCurrentPosition((p) => send({ lat: p.coords.latitude, lng: p.coords.longitude, content: text || 'My location' }), () => setError('Location permission was refused.'))
  const report = async (m) => {
    if (window.confirm && !window.confirm('Report this message to Yaluwo? The admin reads only reported messages.')) return
    await post(`/messages/${m.id}/report`, { reason: 'Inappropriate content' })
    setWarning('Thank you. The message was reported to Yaluwo.')
  }

  if (error && !data) return <Notice tone="danger">{error}</Notice>
  if (!data) return <div className={`grid place-items-center ${className}`}><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>

  let lastDay = ''
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-line ${className}`}>
      {!compact && (
        <div className="border-b border-line px-5 py-3">
          <p className="font-bold">{data.thread.title}</p>
          <p className="text-xs text-muted">{data.people.map((p) => (p.phone ? `${p.firstName} (${p.phone})` : p.firstName)).join(', ')}</p>
        </div>
      )}
      {!data.thread.unmasked && (
        <p className="flex items-center gap-1.5 bg-surface-2 px-5 py-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" /> Phone numbers and links are hidden until the trip is confirmed.
        </p>
      )}
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" data-lenis-prevent>
        {data.messages.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet. Say hello!</p>}
        {data.messages.map((m) => {
          const mine = String(m.senderId) === String(user.id)
          const d = day(m.createdAt)
          const showDay = d !== lastDay
          lastDay = d
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{d}</p>}
              {m.kind === 'SYSTEM' ? (
                <p className="mx-auto max-w-md rounded-2xl bg-brand-soft px-4 py-2 text-center text-xs text-ink">{m.content}</p>
              ) : (
                <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? 'rounded-br-md bg-brand text-on-brand' : 'rounded-bl-md bg-surface-2'}`}>
                    {!mine && <p className="text-xs font-bold text-brand">{m.senderName}</p>}
                    {m.photos?.map((p) => <img key={p} src={p} alt="" className="mt-1 max-h-60 rounded-xl" />)}
                    {m.kind === 'LOCATION' && m.lat != null && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 font-semibold underline">
                        <MapPin className="h-4 w-4" /> Open location in Google Maps
                      </a>
                    )}
                    {m.content && <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>}
                    <p className={`mt-0.5 flex items-center justify-end gap-2 text-[10px] ${mine ? 'text-on-brand/70' : 'text-muted'}`}>
                      {m.ownHasContact && <span>contact hidden from others</span>}
                      {time(m.createdAt)}
                      {!mine && (
                        <button onClick={() => report(m)} className="opacity-0 transition group-hover:opacity-100" aria-label="Report message">
                          <Flag className="h-3 w-3" />
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {(warning || error) && <p className={`px-5 py-2 text-xs ${error ? 'text-danger' : 'text-accent'}`}>{error || warning}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2 border-t border-line p-3">
        <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Send a photo">
          <ImagePlus className="h-5 w-5" />
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files?.length && send({ photos: [...e.target.files] })} />
        </label>
        <button type="button" onClick={shareLocation} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Share my location">
          <MapPin className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-surface-2 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand"
          aria-label="Message"
        />
        <button disabled={busy || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand disabled:opacity-40" aria-label="Send">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </div>
  )
}
