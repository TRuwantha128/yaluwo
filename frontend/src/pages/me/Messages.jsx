import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { get } from '../../api/client'
import { useLive } from '../../auth/AuthProvider'
import Chat from '../../components/Chat'
import { PageLoader } from '../../components/form'

export default function Messages() {
  const { threadId } = useParams()
  const [threads, setThreads] = useState(null)
  const load = () => get('/threads').then((d) => setThreads(d.threads))
  useEffect(() => {
    load()
  }, [threadId])
  useLive((type) => type === 'message' && load())
  if (!threads) return <PageLoader />

  return (
    <div className="wrap pb-8 pt-24">
      <div className="grid h-[calc(100vh-8rem)] gap-4 md:grid-cols-[320px_1fr]">
        <aside className={`min-h-0 overflow-y-auto rounded-3xl bg-surface ring-1 ring-line ${threadId ? 'hidden md:block' : ''}`} data-lenis-prevent>
          <h1 className="px-5 pb-2 pt-5 text-xl font-extrabold tracking-tight">Messages</h1>
          {threads.length === 0 && <p className="px-5 py-6 text-sm text-muted">Chats start when you ask to join a trip or join a group.</p>}
          <ul>
            {threads.map((t) => (
              <li key={t.id}>
                <Link to={`/messages/${t.id}`} className={`flex items-start gap-3 px-5 py-3 transition hover:bg-surface-2 ${String(t.id) === threadId ? 'bg-brand-soft' : ''}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand">{t.title[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{t.title}</span>
                      {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{t.unread}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{t.subtitle}</span>
                    <span className="block truncate text-sm text-muted">{t.last?.content ?? ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className={`min-h-0 ${threadId ? '' : 'hidden md:block'}`}>
          {threadId ? (
            <div className="flex h-full flex-col">
              <Link to="/messages" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted md:hidden"><ArrowLeft className="h-4 w-4" /> All chats</Link>
              <Chat threadId={threadId} className="min-h-0 flex-1" />
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-3xl border-2 border-dashed border-line text-center text-muted">
              <div>
                <MessagesSquare className="mx-auto h-8 w-8" />
                <p className="mt-2 text-sm">Choose a chat</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
