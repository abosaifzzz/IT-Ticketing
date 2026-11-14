import 'dotenv/config'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function integer(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${name}`)
  return value
}

export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV')
  const originUrl = new URL(required('APP_ORIGIN'))
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.username || originUrl.password) throw new Error('APP_ORIGIN must be an HTTP(S) origin without credentials')
  const appOrigin = originUrl.origin
  if (nodeEnv === 'production' && !appOrigin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production')

  return {
    nodeEnv,
    port: integer('PORT', 3001),
    appOrigin,
    database: {
      host: required('DB_HOST'),
      port: integer('DB_PORT', 3306),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: process.env.DB_PASSWORD ?? '',
    },
  }
}
