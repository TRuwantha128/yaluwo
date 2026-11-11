import PhotoHero from '../components/home/PhotoHero'
import Planner from '../components/home/Planner'
import ExploreMap from '../components/ExploreMap'
import { FinalCall, ForDrivers, HowItWorks, OpenTrips, PhotoWall, Promises } from '../components/home/Sections'
import { useTrips } from '../hooks/useTrips'

// The home page: Sri Lanka in photos, then the product itself, a real map you can plan a route on.
export default function Home() {
  const { trips, loading, error } = useTrips()
  return (
    <>
      <PhotoHero />
      <Planner />
      <PhotoWall />
      <HowItWorks />
      <OpenTrips trips={trips} loading={loading} error={error} />
      <ExploreMap />
      <Promises />
      <ForDrivers />
      <FinalCall />
    </>
  )
}
