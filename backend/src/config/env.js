import 'dotenv/config'

// Values that come from the server's environment (secrets, hosts, keys).
// Business values (prices, fees, deadlines) are NOT here: they live in the settings tables.
const required = (name, fallback) => {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name} (see .env.example)`)
  return value
}

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

export const env = {
  isProd,
  isTest,
  isDev: !isProd && !isTest,
  port: Number(process.env.PORT ?? 8080),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  apiUrl: process.env.API_URL ?? 'http://localhost:8080',
  // Hosted databases (Neon, Render) give one DATABASE_URL; locally the DB_* values are used
  db:
    process.env.DATABASE_URL && !isTest
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST ?? '127.0.0.1',
          port: Number(process.env.DB_PORT ?? 5432),
          user: required('DB_USER', isTest ? 'postgres' : undefined),
          password: process.env.DB_PASSWORD ?? '',
          database: isTest ? process.env.DB_NAME_TEST ?? 'yaluwo_test' : required('DB_NAME'),
        },
  jwtSecret: required('JWT_SECRET', isTest ? 'test-jwt' : undefined),
  refreshSecret: required('REFRESH_SECRET', isTest ? 'test-refresh' : undefined),
  dataKey: required('DATA_KEY', isTest ? '1'.repeat(64) : undefined),
  fileSecret: required('FILE_SECRET', isTest ? 'test-file' : undefined),
  storageDir: process.env.STORAGE_DIR ?? './storage/private',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'Yaluwo <no-reply@yaluwo.lk>',
  },
  smsProvider: process.env.SMS_PROVIDER ?? 'dev',
  payhere: {
    mode: process.env.PAYHERE_MODE ?? 'simulate', // simulate | sandbox | live
    merchantId: process.env.PAYHERE_MERCHANT_ID || (process.env.PAYHERE_MODE === 'live' ? '' : 'SIM-MERCHANT'),
    secret: process.env.PAYHERE_MERCHANT_SECRET || (process.env.PAYHERE_MODE === 'live' ? '' : 'SIM-SECRET'),
    checkoutUrl: process.env.PAYHERE_CHECKOUT_URL ?? 'https://sandbox.payhere.lk/pay/checkout',
  },
  googleServerKey: process.env.GOOGLE_MAPS_SERVER_KEY ?? '',
}

if (isProd) {
  if (env.payhere.mode === 'simulate') throw new Error('PAYHERE_MODE=simulate is not allowed in production')
  if (/^0+$/.test(env.dataKey) || env.jwtSecret.startsWith('change-me')) throw new Error('Set real secrets before running in production')
}
if (!/^[0-9a-f]{64}$/i.test(env.dataKey)) throw new Error('DATA_KEY must be 64 hex characters')
