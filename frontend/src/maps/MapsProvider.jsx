import { APIProvider } from '@vis.gl/react-google-maps'
import { MAPS_KEY } from './config'

export default function MapsProvider({ children }) {
  if (!MAPS_KEY) return children
  return (
    <APIProvider apiKey={MAPS_KEY} region="LK" language="en">
      {children}
    </APIProvider>
  )
}
