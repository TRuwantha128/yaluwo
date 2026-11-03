// Errors that become clean JSON replies: { error: { code, message, fields? } }
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const bad = (message, extra) => new HttpError(400, 'BAD_REQUEST', message, extra)
export const unauthorized = (message = 'Please log in.') => new HttpError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = "You can't do this.") => new HttpError(403, 'FORBIDDEN', message)
export const notFound = (what = 'This') => new HttpError(404, 'NOT_FOUND', `${what} was not found.`)
export const conflict = (message, extra) => new HttpError(409, 'CONFLICT', message, extra)
export const tooMany = (message = 'Too many tries. Please wait and try again.') => new HttpError(429, 'TOO_MANY', message)
export const needStepUp = () => new HttpError(403, 'STEP_UP_REQUIRED', 'Confirm with your password and authenticator code first.')

export function assert(condition, error) {
  if (!condition) throw error
}
