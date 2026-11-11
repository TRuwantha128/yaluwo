import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, ImageUp, Loader2, RefreshCw, ScanFace, SwitchCamera, X } from 'lucide-react'
import { loadFaceDetector } from '../../lib/faceDetect'
import { DETAIL_MIN, LIGHT_MAX, LIGHT_MIN, STEADY_MAX, createFrameChecker } from './frameChecks'

// A full-screen camera that takes each photo by itself once the picture is good:
// the face is inside the oval and still, or the card fills the frame, is sharp and still.
// There is always a button to take the photo by hand, and a way out to plain uploads.
//
// shots: [{ key, kind: 'face' | 'card', title, hint }]
// onDone({ [key]: File })   onCancel()   onUseUploads()
const HOLD_MS = { face: 1300, card: 1500 }
const CARD_RATIO = 85.6 / 54 // ID-1: NIC, driving licence, bank card

function describeError(e) {
  if (!window.isSecureContext) return 'The camera only works on a secure (https) page.'
  if (e?.name === 'NotAllowedError') return 'The camera is blocked for this site. Allow it from the address bar (the camera or lock icon), then try again.'
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (e?.name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.'
  return 'The camera could not be started.'
}

export default function CaptureStudio({ shots, onDone, onCancel, onUseUploads }) {
  const [stage, setStage] = useState('intro') // intro | live | review | error
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState({})
  const [preview, setPreview] = useState(null) // { url, file }
  const [error, setError] = useState('')
  const [checks, setChecks] = useState([])
  const [hold, setHold] = useState(0)
  const [flash, setFlash] = useState(0)
  const [facing, setFacing] = useState(null) // override: 'user' | 'environment'
  const [detectorState, setDetectorState] = useState('idle') // idle | loading | ready | off
  const [box, setBox] = useState(null) // the guide in screen pixels
  const [, setStreamVersion] = useState(0)

  const video = useRef(null)
  const stream = useRef(null)
  const stageEl = useRef(null)
  const detector = useRef(null)
  const shot = shots[index]
  const wantFacing = facing ?? (shot.kind === 'face' ? 'user' : 'environment')
  const mirrored = wantFacing === 'user'

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  // ----- camera -----
  const start = useCallback(async () => {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
      stop()
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: wantFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      stream.current = s
      setStreamVersion((n) => n + 1)
      setStage('live')
    } catch (e) {
      setError(describeError(e))
      setStage('error')
    }
  }, [wantFacing, stop])

  useEffect(() => stop, [stop])
  // The page behind must not scroll while the studio is open
  useEffect(() => {
    const old = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.dataset.lenisPrevent = 'true'
    return () => {
      document.documentElement.style.overflow = old
      delete document.documentElement.dataset.lenisPrevent
    }
  }, [])
  // The selfie and the card use different cameras on a phone
  useEffect(() => {
    if (stage !== 'live') return
    const current = stream.current?.getVideoTracks()[0]?.getSettings().facingMode
    if (current && current !== wantFacing) start()
  }, [stage, wantFacing, start])

  useEffect(() => {
    if (stage === 'live' && video.current && stream.current) {
      video.current.srcObject = stream.current
      video.current.play().catch(() => {})
    }
  })

  // The face finder loads once, when the first selfie step opens
  useEffect(() => {
    if (stage !== 'live' || shot.kind !== 'face' || detector.current || detectorState !== 'idle') return
    setDetectorState('loading')
    loadFaceDetector()
      .then((d) => {
        detector.current = d
        setDetectorState('ready')
      })
      .catch(() => setDetectorState('off'))
  }, [stage, shot.kind, detectorState])

  // ----- where the guide sits on screen (the video is cropped to cover the stage) -----
  const layout = useCallback(() => {
    const el = stageEl.current
    const v = video.current
    if (!el || !v?.videoWidth) return null
    const r = el.getBoundingClientRect()
    // Keep the guide's shape right for the screen: an upright oval, a card-shaped frame
    if (shot.kind === 'card') {
      const w = Math.min(r.width * 0.86, (r.height * 0.6) * CARD_RATIO)
      const h = w / CARD_RATIO
      return { left: (r.width - w) / 2, top: (r.height - h) / 2 - r.height * 0.03, width: w, height: h, stage: r }
    }
    const h = Math.min(r.height * 0.62, r.width * 0.78 * 1.32)
    const w = h / 1.32
    return { left: (r.width - w) / 2, top: (r.height - h) / 2 - r.height * 0.02, width: w, height: h, stage: r }
  }, [shot.kind])

  // Screen rectangle -> the same area as fractions of the real camera picture (object-fit: cover)
  const toVideo = useCallback((b) => {
    const v = video.current
    const scale = Math.max(b.stage.width / v.videoWidth, b.stage.height / v.videoHeight)
    const offX = (v.videoWidth * scale - b.stage.width) / 2
    const offY = (v.videoHeight * scale - b.stage.height) / 2
    let x = (b.left + offX) / scale / v.videoWidth
    const y = (b.top + offY) / scale / v.videoHeight
    const width = b.width / scale / v.videoWidth
    const height = b.height / scale / v.videoHeight
    if (mirrored) x = 1 - x - width
    return { x, y, width, height }
  }, [mirrored])

  useEffect(() => {
    if (stage !== 'live') return
    const update = () => setBox(layout())
    const t = setInterval(update, 400)
    window.addEventListener('resize', update)
    update()
    return () => {
      clearInterval(t)
      window.removeEventListener('resize', update)
    }
  }, [stage, layout])

  // ----- take the photo -----
  const take = useCallback(async () => {
    const v = video.current
    const b = layout()
    if (!v?.videoWidth || !b) return
    const canvas = document.createElement('canvas')
    let sx = 0
    let sy = 0
    let sw = v.videoWidth
    let sh = v.videoHeight
    if (shot.kind === 'card') {
      // Keep the card and a small margin around it
      const r = toVideo(b)
      const mx = r.width * 0.08
      const my = r.height * 0.1
      sx = Math.max(0, (r.x - mx) * v.videoWidth)
      sy = Math.max(0, (r.y - my) * v.videoHeight)
      sw = Math.min(v.videoWidth - sx, (r.width + 2 * mx) * v.videoWidth)
      sh = Math.min(v.videoHeight - sy, (r.height + 2 * my) * v.videoHeight)
    }
    const scale = Math.min(1, 1800 / Math.max(sw, sh))
    canvas.width = Math.round(sw * scale)
    canvas.height = Math.round(sh * scale)
    canvas.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (!blob) return
    const file = new File([blob], `${shot.key}.jpg`, { type: 'image/jpeg' })
    setFlash((n) => n + 1)
    navigator.vibrate?.(40)
    setPreview({ url: URL.createObjectURL(blob), file })
    setStage('review')
  }, [layout, shot, toVideo])

  // ----- watch the picture and take the photo when it is good -----
  useEffect(() => {
    if (stage !== 'live') return
    const check = createFrameChecker()
    let goodSince = 0
    let busy = false
    let alive = true
    setHold(0)
    setChecks([])
    const tick = async () => {
      const v = video.current
      const b = layout()
      if (!alive || busy || !v?.videoWidth || !b) return
      busy = true
      try {
        const region = toVideo(b)
        const f = check(v, region)
        if (!f) return
        const light = f.brightness > LIGHT_MIN && f.brightness < LIGHT_MAX
        const steady = f.motion < STEADY_MAX
        let list
        let ready
        if (shot.kind === 'face') {
          let found = null
          if (detector.current) found = await detector.current(v).catch(() => null)
          if (!alive) return
          let inside = false
          let size = false
          if (found) {
            const cx = found.x + found.width / 2
            const cy = found.y + found.height / 2
            inside = Math.abs(cx - (region.x + region.width / 2)) < region.width * 0.3 && Math.abs(cy - (region.y + region.height / 2)) < region.height * 0.22
            size = found.height > region.height * 0.42 && found.height < region.height * 1.05
          }
          list = [
            { label: !detector.current ? 'Finding your face' : found ? 'Face found' : 'Looking for your face', ok: Boolean(found) },
            { label: found && !size ? (found.height <= region.height * 0.42 ? 'Come closer' : 'Move back a little') : 'Inside the oval', ok: inside && size },
            { label: light ? 'Good light' : f.brightness <= LIGHT_MIN ? 'Too dark: face a window or a lamp' : 'Too bright', ok: light },
            { label: 'Hold still', ok: steady },
          ]
          ready = Boolean(found) && inside && size && light && steady
        } else {
          const filled = f.detail > DETAIL_MIN
          list = [
            { label: filled ? 'Card in the frame' : 'Fill the frame with the card', ok: filled },
            { label: light ? 'Good light' : f.brightness <= LIGHT_MIN ? 'Too dark' : 'Too bright: tilt away from the glare', ok: light },
            { label: 'Hold still', ok: steady },
          ]
          ready = filled && light && steady
        }
        setChecks(list)
        const now = performance.now()
        if (ready) {
          goodSince ||= now
          const p = Math.min(1, (now - goodSince) / HOLD_MS[shot.kind])
          setHold(p)
          if (p >= 1) {
            alive = false
            take()
          }
        } else {
          goodSince = 0
          setHold(0)
        }
      } finally {
        busy = false
      }
    }
    const t = setInterval(tick, 140)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [stage, index, shot.kind, layout, toVideo, take])

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setStage('live')
  }
  const accept = () => {
    const next = { ...files, [shot.key]: preview.file }
    setFiles(next)
    URL.revokeObjectURL(preview.url)
    setPreview(null)
    if (index + 1 < shots.length) {
      setIndex(index + 1)
      setFacing(null)
      setStage('live')
    } else {
      stop()
      onDone(next)
    }
  }
  const close = () => {
    stop()
    onCancel()
  }

  const good = checks.length > 0 && checks.every((c) => c.ok)
  const ring = 2 * Math.PI * 49

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0b0c2c] text-white" role="dialog" aria-modal="true" aria-label="Camera">
      {/* top bar: which photo, and the way out */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ol className="flex flex-1 gap-1.5" aria-label={`Photo ${index + 1} of ${shots.length}`}>
          {shots.map((s, i) => (
            <li key={s.key} className={`h-1.5 flex-1 rounded-full ${i < index || files[s.key] ? 'bg-mango' : i === index && stage !== 'intro' ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </ol>
        <button onClick={close} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10" aria-label="Close the camera"><X className="h-5 w-5" /></button>
      </div>

      {stage === 'intro' && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-10">
          <ScanFace className="h-12 w-12 text-mango" strokeWidth={1.5} />
          <h2 className="display mt-6 text-3xl">{shots.length === 1 ? 'One photo' : `${shots.length} photos, about a minute`}</h2>
          <p className="mt-3 text-white/70">Hold steady and the camera takes each photo by itself when the picture is clear.</p>
          <ol className="mt-6 space-y-3">
            {shots.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
                <span className="font-display grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-semibold">{i + 1}</span>
                <span><span className="block font-semibold">{s.title}</span><span className="block text-sm text-white/60">{s.hint}</span></span>
              </li>
            ))}
          </ol>
          <button onClick={start} className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-mango px-6 py-3.5 font-bold text-night transition hover:brightness-95"><Camera className="h-5 w-5" /> Turn on the camera</button>
          <p className="mt-4 text-sm text-white/55">Your face is found on this device. Photos are sent only when you press Send, and only Yaluwo's verification team sees them.</p>
          {onUseUploads && <button onClick={() => { stop(); onUseUploads() }} className="mt-4 inline-flex items-center gap-2 self-start text-sm font-semibold text-white/80 underline-offset-4 hover:underline"><ImageUp className="h-4 w-4" /> Upload photos instead</button>}
        </div>
      )}

      {stage === 'error' && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-10">
          <h2 className="display text-2xl">The camera did not start</h2>
          <p className="mt-3 text-white/75" role="alert">{error}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={start} className="inline-flex items-center gap-2 rounded-2xl bg-mango px-5 py-3 font-bold text-night"><RefreshCw className="h-4 w-4" /> Try again</button>
            {onUseUploads && <button onClick={() => { stop(); onUseUploads() }} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-semibold ring-1 ring-white/20"><ImageUp className="h-4 w-4" /> Upload photos instead</button>}
          </div>
        </div>
      )}

      {(stage === 'live' || stage === 'review') && (
        <>
          <div ref={stageEl} className="relative mx-auto w-full max-w-3xl flex-1 overflow-hidden sm:rounded-3xl">
            <video ref={video} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${stage === 'review' ? 'invisible' : ''}`} />

            {stage === 'live' && box && (
              <>
                {/* Everything outside the guide is dimmed */}
                <svg className="absolute inset-0 h-full w-full" aria-hidden>
                  <defs>
                    <mask id="guide-hole">
                      <rect width="100%" height="100%" fill="white" />
                      {shot.kind === 'face' ? (
                        <ellipse cx={box.left + box.width / 2} cy={box.top + box.height / 2} rx={box.width / 2} ry={box.height / 2} fill="black" />
                      ) : (
                        <rect x={box.left} y={box.top} width={box.width} height={box.height} rx={box.width * 0.04} fill="black" />
                      )}
                    </mask>
                    <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#93359b" /><stop offset="0.6" stopColor="#ec7a63" /><stop offset="1" stopColor="#f6a04b" />
                    </linearGradient>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(11,12,44,0.72)" mask="url(#guide-hole)" />
                </svg>

                {shot.kind === 'face' ? (
                  <svg className="absolute overflow-visible" style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                    {hold > 0 && <ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke={good ? 'url(#sunset)' : '#fff'} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={ring} strokeDasharray={`${hold * ring} ${ring}`} transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray 0.14s linear' }} />}
                  </svg>
                ) : (
                  <div className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden>
                    {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
                      <span key={c} className={`absolute h-9 w-9 transition-colors ${c} ${good ? 'border-mango' : 'border-white'}`} />
                    ))}
                    <span className="absolute inset-x-3 bottom-0 h-1 overflow-hidden rounded-full bg-white/20"><span className="bg-sunset block h-full" style={{ width: `${hold * 100}%`, transition: 'width 0.14s linear' }} /></span>
                  </div>
                )}

                <div className="absolute inset-x-0 top-4 px-4 text-center">
                  <p className="display text-xl sm:text-2xl">{shot.title}</p>
                  <p className="mt-1 text-sm text-white/75">{shot.hint}</p>
                </div>
              </>
            )}

            {stage === 'review' && preview && (
              <div className="absolute inset-0 grid place-items-center p-6">
                <img src={preview.url} alt={`Your photo: ${shot.title}`} className={`max-h-full max-w-full rounded-2xl object-contain ring-1 ring-white/20 ${shot.kind === 'face' && mirrored ? '-scale-x-100' : ''}`} />
              </div>
            )}
            {flash > 0 && <div key={flash} className="shutter-flash pointer-events-none absolute inset-0 bg-white" />}
          </div>

          {/* bottom: what the camera is waiting for, and the controls */}
          <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {stage === 'live' ? (
              <>
                <ul className="flex min-h-9 flex-wrap justify-center gap-2" aria-live="polite">
                  {checks.map((c) => (
                    <li key={c.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${c.ok ? 'bg-mango text-night' : 'bg-white/10 text-white/85'}`}>
                      {c.ok ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />} {c.label}
                    </li>
                  ))}
                  {shot.kind === 'face' && detectorState === 'loading' && <li className="inline-flex items-center gap-1.5 text-sm text-white/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting ready</li>}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button onClick={() => setFacing(wantFacing === 'user' ? 'environment' : 'user')} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="Switch camera"><SwitchCamera className="h-5 w-5" /></button>
                  <button onClick={take} className="group grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full ring-4 ring-white/80" aria-label="Take the photo now">
                    <span className="h-14 w-14 rounded-full bg-white transition group-active:scale-90" />
                  </button>
                  {onUseUploads ? <button onClick={() => { stop(); onUseUploads() }} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="Upload photos instead"><ImageUp className="h-5 w-5" /></button> : <span className="w-12" />}
                </div>
                <p className="mt-2 text-center text-xs text-white/50">{detectorState === 'off' && shot.kind === 'face' ? 'Automatic capture is off on this device. Press the button to take the photo.' : 'The photo is taken by itself. You can also press the button.'}</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <p className="text-sm text-white/75 sm:mr-auto">{shot.kind === 'card' ? 'Can you read every word, with no glare?' : 'Is your whole face clear?'}</p>
                <button onClick={retake} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-semibold ring-1 ring-white/20 hover:bg-white/20 sm:w-auto"><RefreshCw className="h-4 w-4" /> Take it again</button>
                <button onClick={accept} autoFocus className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-mango px-6 py-3 font-bold text-night hover:brightness-95 sm:w-auto"><Check className="h-4 w-4" /> {index + 1 < shots.length ? 'Use this photo' : 'Use this photo and finish'}</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}
