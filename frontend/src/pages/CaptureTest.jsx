import { useState } from 'react'
import CaptureStudio from '../components/capture/CaptureStudio'

// Development only (the route does not exist in a production build): try the camera without an account
const SHOTS = {
  selfie: { key: 'selfie', kind: 'face', title: 'Your face', hint: 'Fit your face in the oval. No sunglasses or cap.' },
  front: { key: 'front', kind: 'card', title: 'Front of your NIC', hint: 'Fill the frame. Avoid glare.' },
}
export default function CaptureTest() {
  const only = new URLSearchParams(location.search).get('only')
  const [done, setDone] = useState(null)
  if (done) return <pre className="p-32" id="done">{JSON.stringify(Object.fromEntries(Object.entries(done).map(([k, f]) => [k, f.size])))}</pre>
  return <CaptureStudio shots={only ? [SHOTS[only]] : Object.values(SHOTS)} onDone={setDone} onCancel={() => history.back()} />
}
