import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Hero from '../components/Hero'
import ExploreMap from '../components/ExploreMap'
import HowItWorks from '../components/HowItWorks'
import Destinations from '../components/Destinations'
import Features from '../components/Features'
import { Partners } from '../components/Partners'
import TripCard from '../components/TripCard'
import EmptyTrips from '../components/EmptyTrips'
import { SectionTitle } from '../components/ui'
import { useTrips } from '../hooks/useTrips'

export default function Home() {
  const { trips, loading } = useTrips()

  return (
    <>
      <Hero />

      <section className="wrap pb-20 pt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle eyebrow="Open trips" title="Join a group that's already going" />
          {trips.length > 0 && (
            <Link to="/trips" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
              {trips.length === 1 ? 'See trip' : `See all ${trips.length} trips`} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <div className="mt-10">
          {!loading && trips.length === 0 ? (
            <EmptyTrips />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {trips.slice(0, 6).map((t) => (
                <TripCard key={t.id} trip={t} />
              ))}
            </div>
          )}
        </div>
      </section>

      <ExploreMap />
      <HowItWorks />
      <Destinations trips={trips} />
      <Features />
      <Partners />
    </>
  )
}
