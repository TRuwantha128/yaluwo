import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { HttpError, bad } from '../lib/errors.js'

// Parse and check a request body with a zod schema
export function parse(schema, data) {
  const r = schema.safeParse(data)
  if (!r.success) {
    const fields = {}
    for (const issue of r.error.issues) fields[issue.path.join('.') || 'body'] ??= issue.message
    throw bad(Object.values(fields)[0] ?? 'Please check the form.', { fields })
  }
  return r.data
}

// Files stay in memory until saveUpload checks and stores them
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 12 } })

export const limiter = (max, minutes = 15) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: env.isTest ? 10000 : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY', message: 'Too many requests. Please wait a few minutes.' } },
  })

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } })
  }
  if (err instanceof ZodError) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Please check the form.' } })
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The file is too big.' } })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON.' } })
  // PostgreSQL: 23505 = duplicate, 22P02 = an id in the address that is not a number
  if (err?.code === '23505') return res.status(409).json({ error: { code: 'CONFLICT', message: 'This already exists.' } })
  if (err?.code === '22P02') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } })
  console.error(`[${req.method} ${req.originalUrl}]`, err)
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' } })
}
