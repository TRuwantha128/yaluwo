import { Suspense, lazy } from 'react'

// The map library is large, so it is downloaded only when a page really shows a map
const LiveMap = lazy(() => import('./LiveMap'))

export default function Map({ className = '', ...props }) {
  return (
    <Suspense fallback={<div className={`animate-pulse bg-surface-2 ${className}`} />}>
      <LiveMap className={className} {...props} />
    </Suspense>
  )
}
