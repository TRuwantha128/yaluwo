import { Link } from 'react-router-dom'
import { btn } from '../components/ui'

export default function NotFound({ title = 'Page not found', text = 'This page does not exist or was removed.' }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 pt-24 text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-muted">{text}</p>
      <Link to="/" className={`${btn.primary} mt-8`}>
        Back to home
      </Link>
    </div>
  )
}
