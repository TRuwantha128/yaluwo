import Planner from '../components/home/Planner'
import ExploreMap from '../components/ExploreMap'
import { FinalCall, ForDrivers, HowItWorks, OpenTrips, Promises } from '../components/home/Sections'
import { useTrips } from '../hooks/useTrips'

// The home page opens on the product itself: a real map and a route you can build on it.
export default function Home() {
  const { trips, loading, error } = useTrips()
  return (
    <>
      <Planner />
      <HowItWorks />
      <OpenTrips trips={trips} loading={loading} error={error} />
      <ExploreMap />
      <Promises />
      <ForDrivers />
      <FinalCall />
    </>
  )
}
