'use strict'

const test = require('brittle')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const createTestnet = require('hyperdht/testnet')
const oceanMock = require('ocean-mdk-worker/mock/server')
const { startOceanWorker } = require('../../backend/adapters/ocean-adapter')
const { pullPoolStats, pullPoolStatsHistory, resolveFamily } = require('../../backend/apps/site/controllers/utils')

const WORKER_ID = 'ocean-pool-worker'

test('startOceanWorker - rejects missing boot options', async (t) => {
  const base = { workerId: 'w', storeDir: 's', pool: { apiUrl: 'http://x', accounts: ['a'] } }
  await t.exception(() => startOceanWorker({ ...base, workerId: undefined }), /ERR_WORKER_ID_REQUIRED/)
  await t.exception(() => startOceanWorker({ ...base, storeDir: undefined }), /ERR_STORE_DIR_REQUIRED/)
  await t.exception(() => startOceanWorker({ ...base, pool: undefined }), /ERR_POOL_CONF_REQUIRED/)
})

test('ocean-pool-worker classifies as a minerpool without a provisioning config', (t) => {
  t.is(resolveFamily({ workerId: WORKER_ID }, { error: 'ERR_UNKNOWN_QUERY_TYPE: config' }), 'minerpool')
})

test('pullPoolStats / pullPoolStatsHistory - keep reading V1 ext_data when served', async (t) => {
  const row = { username: 'u', hashrate: 1 }
  const calls = []
  const mdkClient = {
    pullTelemetry: async (id, q) => {
      calls.push(q.type)
      return q.key === 'stats' ? { extData: { stats: [row] } } : { extData: [{ ts: 1, stats: [row] }] }
    }
  }
  t.alike(await pullPoolStats(mdkClient, 'p'), [row])
  t.alike(await pullPoolStatsHistory(mdkClient, 'p', { start: 0, end: 2 }), [{ ts: 1, stats: [row] }])
  t.alike(calls, ['ext_data', 'ext_data'], 'no contract-channel fallback for a V1 pool')
})

test('startOceanWorker - boots fail-closed against its mock; site helpers read its contract channels', { timeout: 60000 }, async (t) => {
  const testnet = await createTestnet(3)
  const { app } = oceanMock.createServer({ port: 0, host: '127.0.0.1', delay: 0 })
  await new Promise((resolve) => app.server.once('listening', resolve))
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-site-ocean-'))
  t.teardown(async () => {
    await app.close()
    await testnet.destroy()
    fs.rmSync(storeDir, { recursive: true, force: true })
  })

  const handle = await startOceanWorker({
    workerId: WORKER_ID,
    storeDir,
    pool: { apiUrl: `http://127.0.0.1:${app.server.address().port}`, accounts: ['test'] },
    bootstrap: testnet.bootstrap,
    allowedKeys: [crypto.randomBytes(32).toString('hex')]
  })
  t.teardown(() => handle.stop(), { order: -1 })

  t.is(handle.runtime.getAllowedKeys().length, 1, 'only the passed key is admitted')

  // Stand-in for the site plugin's mdkClient: the Kernel hop is out of scope,
  // what matters is the payload the worker answers each query with.
  const calls = []
  const mdkClient = {
    pullTelemetry: async (deviceId, query) => {
      calls.push(query.type)
      const res = await handle.runtime._handleTelemetry({ action: 'telemetry.pull', deviceId, payload: { query } })
      return res.payload
    }
  }

  const stats = await pullPoolStats(mdkClient, WORKER_ID)
  t.is(stats.length, 1)
  t.is(stats[0].username, 'test')
  t.is(stats[0].poolType, 'ocean')
  t.ok(stats[0].hashrate > 0, 'hashrate (H/s) polled from the mock')
  t.alike(calls, ['ext_data', 'stats'], 'falls back from ext_data to the stats channel')

  const history = await pullPoolStatsHistory(mdkClient, WORKER_ID, { start: 0, end: Date.now() + 60000 })
  t.ok(history.length >= 1, 'stats_history holds the first refresh')
  t.ok(history[0].stats[0].hashrate > 0)
})
