// Finds a face in the camera picture, entirely in the browser: no frame ever leaves
// the device until the person presses "Send". The model (190 KB) is served from
// /models on this site, and the library is only downloaded when the camera opens.
let loading = null

export function loadFaceDetector() {
  loading ??= (async () => {
    const faceapi = await import('@vladmandic/face-api')
    try {
      await faceapi.tf.setBackend('webgl')
    } catch {
      await faceapi.tf.setBackend('cpu')
    }
    await faceapi.tf.ready()
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    // Returns { x, y, width, height } as fractions of the picture, or null
    return async (video) => {
      const found = await faceapi.detectSingleFace(video, options)
      if (!found) return null
      const { x, y, width, height } = found.box
      const w = video.videoWidth || video.width
      const h = video.videoHeight || video.height
      return { x: x / w, y: y / h, width: width / w, height: height / h, score: found.score }
    }
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}
