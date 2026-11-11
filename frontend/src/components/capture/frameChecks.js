// Cheap checks on a small copy of the camera picture: is it bright enough, is it
// steady, and is there something sharp inside the guide (a card, not a blank wall)?
const W = 160

export function createFrameChecker() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let last = null

  // region: { x, y, width, height } as fractions of the picture
  return function check(video, region) {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return null
    const H = Math.round((W * vh) / vw)
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
      last = null
    }
    ctx.drawImage(video, 0, 0, W, H)
    const { data } = ctx.getImageData(0, 0, W, H)
    const grey = new Uint8Array(W * H)
    for (let i = 0, p = 0; i < grey.length; i++, p += 4) grey[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8

    const x0 = Math.max(1, Math.floor(region.x * W))
    const x1 = Math.min(W - 1, Math.ceil((region.x + region.width) * W))
    const y0 = Math.max(1, Math.floor(region.y * H))
    const y1 = Math.min(H - 1, Math.ceil((region.y + region.height) * H))
    let sum = 0
    let moved = 0
    let edges = 0
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x
        const v = grey[i]
        sum += v
        if (last) moved += Math.abs(v - last[i])
        // how different this pixel is from its four neighbours (text and photo edges score high)
        const lap = Math.abs(4 * v - grey[i - 1] - grey[i + 1] - grey[i - W] - grey[i + W])
        if (lap > 40) edges++
        n++
      }
    }
    const result = { brightness: sum / n, motion: last ? moved / n : 99, detail: edges / n }
    last = grey
    return result
  }
}

export const LIGHT_MIN = 55
export const LIGHT_MAX = 238
export const STEADY_MAX = 5.5
export const DETAIL_MIN = 0.035
