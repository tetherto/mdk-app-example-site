'use strict'

const test = require('brittle')

const controller = require('../../backend/apps/site/controllers/pools')

// The site app's `config.defaultPools` in mdk.yaml.
const DEFAULT_POOLS = [{ url: 'stratum+tcp://btc.example-pool.com:3333', worker_name: 'account.worker', worker_password: 'x' }]

function makeServices (result = { commandId: 'cmd-1', status: 'PENDING' }) {
  const calls = []
  return {
    calls,
    services: {
      defaultPools: DEFAULT_POOLS,
      mdkClient: {
        sendCommand: async (deviceId, command, params) => {
          calls.push({ deviceId, command, params })
          return result
        }
      }
    }
  }
}

test('pools controller - requires mdkClient', async (t) => {
  await t.exception(controller({ params: { deviceId: 'd1' } }, {}), /ERR_MDK_CLIENT_UNAVAILABLE/)
})

test('pools controller - requires deviceId', async (t) => {
  const { services } = makeServices()
  await t.exception(controller({ params: {} }, services), /ERR_DEVICE_ID_REQUIRED/)
})

test('pools controller - rejects pool without worker_name', async (t) => {
  const { services } = makeServices()
  const req = { params: { deviceId: 'd1' }, body: { pools: [{ url: 'stratum+tcp://p:1' }] } }
  await t.exception(controller(req, services), /ERR_INVALID_POOLS/)
})

test('pools controller - rejects more than 3 pools', async (t) => {
  const { services } = makeServices()
  const pool = { url: 'stratum+tcp://p:1', worker_name: 'w' }
  const req = { params: { deviceId: 'd1' }, body: { pools: [pool, pool, pool, pool] } }
  await t.exception(controller(req, services), /ERR_INVALID_POOLS/)
})

test('pools controller - dispatches body pools', async (t) => {
  const { services, calls } = makeServices()
  const pools = [{ url: 'stratum+tcp://p:1', worker_name: 'acct.w', worker_password: 'x' }]
  const res = await controller({ params: { deviceId: 'd1' }, body: { pools } }, services)

  t.is(calls.length, 1)
  t.is(calls[0].deviceId, 'd1')
  t.is(calls[0].command, 'setupPools')
  t.alike(calls[0].params, { pools })
  t.alike(res.pools, ['stratum+tcp://p:1'])
  t.is(res.status, 'PENDING')
})

test('pools controller - falls back to the app config defaultPools', async (t) => {
  const { services, calls } = makeServices()
  const res = await controller({ params: { deviceId: 'd1' }, body: {} }, services)

  t.alike(calls[0].params.pools, DEFAULT_POOLS)
  t.alike(res.pools, DEFAULT_POOLS.map((p) => p.url))
})

test('pools controller - passes appendId false through', async (t) => {
  const { services, calls } = makeServices()
  const pools = [{ url: 'stratum+tcp://p:1', worker_name: 'w' }]
  await controller({ params: { deviceId: 'd1' }, body: { pools, appendId: false } }, services)

  t.is(calls[0].params.appendId, false)
})
