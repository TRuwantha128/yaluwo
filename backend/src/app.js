import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { errorHandler } from './middleware/http.js'
import { requireAuth } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import publicRoutes from './routes/public.js'
import meRoutes from './routes/me.js'
import tripRoutes from './routes/trips.js'
import chatRoutes from './routes/chat.js'
import partnerRoutes from './routes/partner.js'
import paymentRoutes from './routes/payments.js'
import trustRoutes from './routes/trust.js'
import adminCore from './routes/admin/core.js'
import adminMoney from './routes/admin/money.js'
import adminSettings from './routes/admin/settings.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))
  // The website calls the API from its own address only
  app.use(cors({ origin: [env.appUrl], credentials: true }))
  app.use(cookieParser())
  app.use(express.json({ limit: '1mb' }))

  const api = express.Router()
  api.use('/auth', authRoutes)
  api.use('/', publicRoutes)
  api.use('/me', meRoutes)
  api.use('/', paymentRoutes) // includes the PayHere webhook (no login)
  api.use('/', tripRoutes)
  api.use('/', trustRoutes)
  api.use('/', chatRoutes)
  api.use('/partner', partnerRoutes)
  api.use('/admin', requireAuth, adminCore)
  api.use('/admin', requireAuth, adminSettings)
  api.use('/admin', requireAuth, adminMoney)
  api.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route ${req.method} ${req.path}` } }))

  app.use('/api/v1', api)
  app.use(errorHandler)
  return app
}
