import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

let _db: PrismaClient | null = null
let _dbInitFailed = false
let _healthChecked = false
let _modelCheckPassed = false
// Rate-limit: only log the "model undefined" error once per 60 seconds
let _lastModelErrorLoggedAt = 0
const MODEL_ERROR_LOG_INTERVAL = 60_000

/**
 * Properties to skip in the Proxy — these are standard JS interop methods
 * that exist on all objects but return undefined on PrismaClient.
 * Without this exclusion, Promise interop (then, catch, finally) triggers
 * false-positive "model undefined" errors.
 */
const SKIP_PROPS = new Set([
  // Promise interop — JavaScript runtime checks these when awaiting/returning
  'then', 'catch', 'finally',
  // Common object methods
  'toJSON', 'toString', 'valueOf', 'toLocaleString',
  'constructor', 'prototype', '__proto__',
  // Symbol properties (stringified by Proxy)
  'Symbol(Symbol.toPrimitive)',
  'Symbol(Symbol.toStringTag)',
  'Symbol(Symbol.iterator)',
  'Symbol(Symbol.asyncIterator)',
  // Node.js internals
  'inspect', 'toJSON',
])

/**
 * Check if a property name looks like a Prisma model delegate
 * (camelCase starting with lowercase, not a known JS method)
 */
function isLikelyModelProperty(prop: string): boolean {
  if (SKIP_PROPS.has(prop)) return false
  if (typeof prop !== 'string') return false
  if (!/^[a-z]/.test(prop)) return false
  if (prop.length < 2) return false
  // Skip single-word JS methods that might be on prototypes
  if (['then', 'catch', 'finally', 'constructor', 'hasOwnProperty', 'isPrototypeOf',
       'propertyIsEnumerable', 'valueOf', 'toLocaleString'].includes(prop)) return false
  return true
}

/**
 * Critical models that should always exist in the generated Prisma client.
 * Used to verify that `prisma generate` was run successfully.
 */
const CRITICAL_MODELS = [
  'user', 'role', 'permission', 'rolePermission', 'userRole',
  'asset', 'workOrder', 'maintenanceRequest', 'plant', 'department',
  'notification', 'auditLog',
] as const

/**
 * Check whether the Prisma client has the expected model delegates.
 */
function checkPrismaModels(client: PrismaClient): { ok: boolean; missing?: string[] } {
  const missing: string[] = []
  for (const model of CRITICAL_MODELS) {
    if ((client as any)[model] === undefined || (client as any)[model] === null) {
      missing.push(model)
    }
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/**
 * Run a one-time health check on the Prisma client after initialization.
 */
function runHealthCheck(client: PrismaClient) {
  if (_healthChecked) return
  _healthChecked = true

  const result = checkPrismaModels(client)
  if (result.ok) {
    _modelCheckPassed = true
    console.log('[db] ✓ Prisma client health check passed — all critical models available')
  } else {
    console.error(
      `[db] ✗ Prisma client health check FAILED — missing models: ${result.missing!.join(', ')}\n` +
      `[db]   FIX: rm -rf node_modules/.prisma && npx prisma generate && next build && pm2 restart`
    )
  }
}

function initDb(): PrismaClient {
  if (_dbInitFailed) {
    throw new Error('[db] Database not available — previous initialization failed. Check DATABASE_URL / PostgreSQL settings.')
  }

  try {
    const connectionString = process.env.DATABASE_URL || ''
    if (!/^postgres(?:ql)?:\/\//.test(connectionString)) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql://')
    }

    const adapter = new PrismaPg({
      connectionString,
      max: Number.parseInt(process.env.DB_POOL_MAX || '20', 10),
      connectionTimeoutMillis: Number.parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
      idleTimeoutMillis: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    })

    _db = new PrismaClient({ adapter })
    const url = new URL(connectionString)
    console.log('[db] Connected to PostgreSQL:', url.host, '/', url.pathname.slice(1))
    runHealthCheck(_db)
    return _db
  } catch (e) {
    console.error('[db] PostgreSQL adapter initialization failed:', (e as Error).message)
    _dbInitFailed = true
    throw e
  }
}

function getDb(): PrismaClient {
  if (_db) return _db
  return initDb()
}

/**
 * Lazy-initialized Prisma client proxy.
 * Defers actual connection until first query.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Skip Symbol properties entirely
    if (typeof prop === 'symbol') return undefined

    try {
      const client = getDb()
      const value = (client as any)[prop]

      // Only flag as missing if it looks like a real model delegate name
      if (value === undefined && isLikelyModelProperty(prop)) {
        const now = Date.now()
        if (now - _lastModelErrorLoggedAt > MODEL_ERROR_LOG_INTERVAL) {
          _lastModelErrorLoggedAt = now
          console.error(
            `[db] Model or property "${prop}" is undefined on PrismaClient. ` +
            `This usually means prisma generate was not run after schema changes. ` +
            `Run: npx prisma generate`
          )
        }
        return new Proxy({}, {
          get(_inner, method) {
            if (typeof method === 'string' && /^[a-z]/.test(method)) {
              return (..._args: any[]) => {
                return Promise.reject(new Error(
                  `PrismaClient.${prop}.${method}() is not available. Run: npx prisma generate`
                ))
              }
            }
            return undefined
          }
        })
      }
      if (typeof value === 'function') {
        return value.bind(client)
      }
      return value
    } catch (e) {
      if (typeof prop === 'string' && isLikelyModelProperty(prop)) {
        return new Proxy({}, {
          get(_inner, method) {
            if (typeof method === 'string' && /^[a-z]/.test(method)) {
              return (..._args: any[]) => {
                console.warn(`[db] ${prop}.${method}() skipped — database not initialized:`, (e as Error).message)
                return Promise.resolve(null)
              }
            }
            return undefined
          }
        })
      }
      return undefined
    }
  },
})

/**
 * Health check for diagnostic endpoints.
 */
export async function checkDbHealth() {
  try {
    const client = getDb()
    const models = Object.keys(client).filter(
      k => !k.startsWith('_') && !k.startsWith('$') && typeof (client as any)[k] === 'object'
    )
    const modelCheck = checkPrismaModels(client)

    return {
      connected: true,
      modelCheckPassed: modelCheck.ok,
      missingModels: modelCheck.missing || [],
      totalModels: models.length,
      models,
      env: {
        hasDbHost: !!process.env.DB_HOST,
        hasDbUser: !!process.env.DB_USER,
        hasDbName: !!process.env.DB_NAME,
        hasDbPort: !!process.env.DB_PORT,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: (process.env.DATABASE_URL || '').slice(0, 20) + '...',
      },
    }
  } catch (e) {
    return {
      connected: false,
      modelCheckPassed: false,
      missingModels: [...CRITICAL_MODELS],
      totalModels: 0,
      models: [],
      error: e instanceof Error ? e.message : String(e),
      env: {
        hasDbHost: !!process.env.DB_HOST,
        hasDbUser: !!process.env.DB_USER,
        hasDbName: !!process.env.DB_NAME,
        hasDbPort: !!process.env.DB_PORT,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: '',
      },
    }
  }
}
