import Journey from '../components/home/Journey'
import ExploreMap from '../components/ExploreMap'
import { FinalCall, ForDrivers, OpenTrips, Promises, ShareEstimator } from '../components/home/Sections'
import { useTrips } from '../hooks/useTrips'

export default function Home() {
  const { trips, loading, error } = useTrips()
  return (
    <>
      <Journey />
      <OpenTrips trips={trips} loading={loading} error={error} />
      <ShareEstimator />
      <ExploreMap />
      <Promises />
      <ForDrivers />
      <FinalCall />
    </>
  )
}
