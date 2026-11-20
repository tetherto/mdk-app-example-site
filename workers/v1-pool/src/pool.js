'use strict'

// The EMCD, SpiderPool and Foundry workers are v1 plugins: their handlers read
// a pool service the host passes in as the device, which `mdk.yaml` cannot
// carry. This builds that service for the one device this worker hosts, from
// its opts, and polls it the way the vendor boot helpers do.
const path = require('node:path')
const { opts, env, logger } = require('@tetherto/mdk-worker/device')

// Credentials come from the worker's `env` in mdk.yaml; without them the
// vendor's mock fixtures are used, which only the bundled mock accepts.
const KINDS = {
  emcd: {
    pkg: 'emcd-mdk-worker',
    Pool: 'EMCD_POOL',
    credentials: () => pick({ apiKey: 'EMCD_API_KEY', apiSecret: 'EMCD_API_SECRET' }) ||
      require('emcd-mdk-worker/mock/keys')
  },
  spiderpool: {
    pkg: 'spiderpool-mdk-worker',
    Pool: 'SPIDER_POOL',
    credentials: () => pick({ accessKey: 'SPIDERPOOL_ACCESS_KEY', privateKey: 'SPIDERPOOL_PRIVATE_KEY' }) || (({ TEST_ACCESS_KEY, TEST_PRIVATE_KEY }) =>
      ({ accessKey: TEST_ACCESS_KEY, privateKey: TEST_PRIVATE_KEY }))(require('spiderpool-mdk-worker/mock/keys'))
  },
  foundry: {
    pkg: 'foundry-mdk-worker',
    Pool: 'FOUNDRY_POOL',
    credentials: () => pick({ apiKey: 'FOUNDRY_API_KEY' }) || { apiKey: require('foundry-mdk-worker/mock/keys').apiKey }
  }
}

function pick (names) {
  const entries = Object.entries(names).map(([key, name]) => [key, env[name]])
  return entries.every(([, value]) => value) ? Object.fromEntries(entries) : null
}

async function start () {
  const kind = KINDS[opts.kind]
  if (!kind) throw new Error(`ERR_POOL_KIND_INVALID: "${opts.kind}", expected one of ${Object.keys(KINDS).join(', ')}`)
  const Pool = require(kind.pkg)[kind.Pool]
  const apiUrl = opts.apiUrl || `http://${opts.host || '127.0.0.1'}:${opts.port}${opts.apiPath || ''}`
  // The CLI hands every device a dbPath under the worker's own state dir.
  const storeDir = path.join(path.dirname(opts.dbPath), 'pool')
  const pool = new Pool(
    { [opts.kind]: { apiUrl, accounts: opts.accounts || [], ...kind.credentials() } },
    { rack: opts.rack || 'site-1', storeDir, root: storeDir }
  )
  await pool.init()

  const tick = async () => {
    const now = new Date()
    try {
      await pool.fetchWorkers(now)
      await pool.fetchStats(now)
      await pool.saveStats(now)
    } catch (err) {
      logger('pool poll failed: %s', err.message)
    }
  }
  await tick()
  setInterval(tick, opts.tickMs || 10000).unref()
  return pool
}

const ready = start()
// Surfaced by the handlers that await it, not as an unhandled rejection.
ready.catch(() => {})

module.exports = { ready }
