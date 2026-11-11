import { useEffect, useState } from 'react'
import { Camera, Check, Loader2 } from 'lucide-react'
import { get, put, upload } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Field, Notice, PageLoader, input, useAction } from '../../components/form'
import { Avatar, btn } from '../../components/ui'

// The 6-question travel-style quiz (powers the match % on trips)
const QUIZ = [
  ['budget', 'Budget', [['SAVER', 'Saver'], ['MID', 'Mid-range'], ['COMFORT', 'Comfort']]],
  ['pace', 'Pace', [['SLOW', 'Slow, lots of rest'], ['BALANCED', 'Balanced'], ['PACKED', 'See everything']]],
  ['food', 'Food', [['ANYTHING', 'I eat anything'], ['VEGETARIAN', 'Vegetarian'], ['VEGAN', 'Vegan'], ['HALAL', 'Halal']]],
  ['smoking', 'Smoking', [['NO', 'No smoking'], ['OUTSIDE_OK', 'Outside is fine'], ['YES', 'I smoke']]],
  ['drinking', 'Drinking', [['NO', "I don't drink"], ['SOMETIMES', 'Sometimes'], ['YES', 'Yes']]],
  ['wake_time', 'Mornings', [['EARLY', 'Up for sunrise'], ['NORMAL', 'Normal'], ['LATE', 'Late starts']]],
]

export default function Profile() {
  const { user } = useAuth()
  const config = useConfig()
  const [me, setMe] = useState(null)
  const [quiz, setQuiz] = useState({})
  const [about, setAbout] = useState({ bio: '', languages: [] })
  const [contact, setContact] = useState({ name: '', phone: '', relationship: '' })
  const [saved, setSaved] = useState('')
  const a = useAction()

  useEffect(() => {
    get('/me').then((m) => {
      setMe(m)
      setQuiz(m.preferences ?? {})
      setAbout({ bio: m.profile.bio, languages: m.profile.languages })
      if (m.emergencyContact) setContact(m.emergencyContact)
    })
  }, [])
  if (!me) return <PageLoader />

  const flash = (what) => {
    setSaved(what)
    setTimeout(() => setSaved(''), 2500)
  }
  const languages = config?.lists?.LANGUAGE?.map((l) => l.label_en) ?? ['English', 'Sinhala', 'Tamil']

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16 pt-28">
      <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
      {a.error && <Notice tone="danger">{a.error}</Notice>}

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            {me.profile.photo ? <img src={me.profile.photo} alt="" className="h-20 w-20 rounded-full object-cover" /> : <Avatar name={user.fullName} size="h-20 w-20 text-xl" />}
            <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-brand text-on-brand ring-4 ring-surface"><Camera className="h-4 w-4" /></span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && a.run(async () => { const r = await upload('/me/photo', { photo: e.target.files[0] }); setMe({ ...me, profile: { ...me.profile, photo: r.photo } }) })} />
          </label>
          <div>
            <p className="text-lg font-bold">{user.fullName}</p>
            <p className="text-sm text-muted">Others see your first name, photo, rating and badges.</p>
          </div>
        </div>
        <Field label="About you" hint="no phone numbers or links" className="mt-6">
          <textarea value={about.bio} onChange={(e) => setAbout({ ...about, bio: e.target.value })} rows={3} maxLength={600} className={`${input} h-auto py-3`} />
        </Field>
        <p className="mt-4 text-sm font-semibold">Languages</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {languages.map((l) => (
            <button key={l} type="button" onClick={() => setAbout({ ...about, languages: about.languages.includes(l) ? about.languages.filter((x) => x !== l) : [...about.languages, l] })} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${about.languages.includes(l) ? 'bg-brand text-on-brand' : 'bg-surface-2 hover:ring-1 hover:ring-brand'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => a.run(async () => { await put('/me', about); flash('about') })} className={`${btn.primary} mt-6`}>
          {saved === 'about' ? <Check className="h-4 w-4" /> : a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </section>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <h2 className="text-xl font-bold tracking-tight">Travel style</h2>
        <p className="mt-1 text-sm text-muted">Six quick questions. Trips show how well you match the organiser.</p>
        <div className="mt-6 space-y-5">
          {QUIZ.map(([key, label, options]) => (
            <div key={key}>
              <p className="text-sm font-semibold">{label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.map(([value, text]) => (
                  <button key={value} type="button" onClick={() => setQuiz({ ...quiz, [key]: value })} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${quiz[key] === value ? 'bg-brand text-on-brand' : 'bg-surface-2 hover:ring-1 hover:ring-brand'}`}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button disabled={QUIZ.some(([k]) => !quiz[k])} onClick={() => a.run(async () => { await put('/me/preferences', quiz); flash('quiz') })} className={`${btn.primary} mt-6`}>
          {saved === 'quiz' && <Check className="h-4 w-4" />} Save answers
        </button>
      </section>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <h2 className="text-xl font-bold tracking-tight">Emergency contact</h2>
        <p className="mt-1 text-sm text-muted">Needed before your first trip. Told only if you don't mark "Arrived safely" and you opted in.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Name"><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={input} /></Field>
          <Field label="Phone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={input} /></Field>
          <Field label="Relationship"><input value={contact.relationship ?? ''} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} className={input} /></Field>
        </div>
        <button disabled={!contact.name || !contact.phone} onClick={() => a.run(async () => { await put('/me/emergency-contact', contact); flash('contact') })} className={`${btn.primary} mt-6`}>
          {saved === 'contact' && <Check className="h-4 w-4" />} Save contact
        </button>
      </section>
    </div>
  )
}
