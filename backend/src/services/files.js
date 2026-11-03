import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '../config/env.js'
import { bad } from '../lib/errors.js'
import { hmac, safeEqual, sha256 } from '../lib/crypto.js'

// Private storage for ID documents, slips and photos. Files are never public:
// they are read through short-lived signed links (5 minutes, workflow section 23).
// Swap this file for S3-compatible storage later; the rest of the app only uses these functions.
const ROOT = path.resolve(env.storageDir)
const KINDS = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'],
}
const MAX_BYTES = { image: 8 * 1024 * 1024, document: 10 * 1024 * 1024, video: 25 * 1024 * 1024 }

// Checks the real file type from its contents, not the name the browser sent
export async function saveUpload(file, { kind = 'document', folder }) {
  if (!file?.buffer?.length) throw bad('Please choose a file.')
  if (file.buffer.length > MAX_BYTES[kind]) throw bad(`The file is too big (most ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB).`)
  const type = await fileTypeFromBuffer(file.buffer)
  if (!type || !KINDS[kind].includes(type.mime)) throw bad(`This file type is not allowed. Use ${KINDS[kind].map((m) => m.split('/')[1].toUpperCase()).join(', ')}.`)
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${type.ext}`
  const full = path.join(ROOT, key)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, file.buffer, { mode: 0o600 })
  return { key, mime: type.mime, size: file.buffer.length, hash: sha256(file.buffer.toString('base64')) }
}

export async function saveBuffer(buffer, { folder, ext }) {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
  const full = path.join(ROOT, key)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, buffer, { mode: 0o600 })
  return key
}

export function filePath(key) {
  const full = path.resolve(ROOT, key)
  if (!full.startsWith(ROOT + path.sep)) throw bad('Bad file key')
  return full
}

// /api/v1/files/<key>?exp=...&sig=...
export function signedUrl(key, seconds = 300) {
  if (!key) return null
  const exp = Math.floor(Date.now() / 1000) + seconds
  const sig = hmac(env.fileSecret, `${key}:${exp}`)
  // Full address, so links work when the website and the API are on different domains
  return `${env.apiUrl}/api/v1/files/${key}?exp=${exp}&sig=${sig}`
}

export function checkSignature(key, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  return safeEqual(hmac(env.fileSecret, `${key}:${exp}`), sig)
}
