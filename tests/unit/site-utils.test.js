'use strict'

const test = require('brittle')
const {
  loadSite,
  snapStats,
  snapConfig,
  pullPoolStatsHistory,
  resolveFamily
} = require('../../backend/apps/site/controllers/utils')

// A fake mdkClient answering per device id and query type. `telemetry` maps
// `<deviceId>:<type>` to a value, or to a function of the query.
const fakeClient = ({ workers = [], telemetry = {}, capabilities = {} } = {}) => {
  const calls = []
  return {
    calls,
    listWorkers: async () => ({ workers }),
    getCapabilities: async (id) => {
      if (capabilities[id] instanceof Error) throw capabilities[id]
      return capabilities[id] ?? null
    },
    pullTelemetry: async (id, query) => {
      calls.push({ id, ...query })
      const entry = telemetry[`${id}:${query.type}`]
      if (entry instanceof Error) throw entry
      return typeof entry === 'function' ? entry(query) : (entry ?? null)
    }
  }
}

test('resolveFamily - the contract deviceFamily wins over the workerId fallback', (t) => {
  const cfg = { config: { contract: { deviceFamily: 'container' } } }
  t.is(resolveFamily({ workerId: 'whatsminer-worker' }, cfg), 'container')
  t.is(resolveFamily({ workerId: 'whatsminer-worker' }, null), 'miner')
  t.is(resolveFamily({ workerId: 'unknown-worker' }, {}), null)
})

test('snapStats / snapConfig - read the latest snap, or an empty object', (t) => {
  const thg = { last: { snap: { stats: { power_w: 5 }, config: { power_mode: 'low' } } } }
  t.alike(snapStats(thg), { power_w: 5 })
  t.alike(snapConfig(thg), { power_mode: 'low' })
  t.alike(snapStats(null), {})
  t.alike(snapConfig({ last: {} }), {})
})

test('pullPoolStatsHistory - empty for a non-array ext_data, contract channel otherwise', async (t) => {
  const range = { start: 0, end: 1 }
  const objectExt = fakeClient({ telemetry: { 'p:ext_data': { extData: { unexpected: true } } } })
  t.alike(await pullPoolStatsHistory(objectExt, 'p', range), [])

  const rows = [{ ts: 1, stats: [] }]
  const contract = fakeClient({ telemetry: { 'p:stats_history': { value: rows } } })
  t.alike(await pullPoolStatsHistory(contract, 'p', range), rows)

  const nothing = fakeClient()
  t.alike(await pullPoolStatsHistory(nothing, 'p', range), [])
})

test('loadSite - throws without a client', async (t) => {
  await t.exception(() => loadSite(null), /ERR_MDK_CLIENT_UNAVAILABLE/)
})

test('loadSite - groups things by family, records pools, skips dead workers', async (t) => {
  const workers = [
    { workerId: 'whatsminer-worker', deviceIds: ['WM-1', 'WM-2'] },
    { workerId: 'ocean-pool-worker', deviceIds: ['ocean-1'] },
    { workerId: 'gone-worker', deviceIds: ['G-1'], state: 'TERMINATED' },
    { workerId: 'dead-worker', deviceIds: ['D-1'], healthState: 'DEAD' }
  ]
  const things = [{ id: 'WM-1' }, { id: 'WM-2' }]
  const client = fakeClient({
    workers,
    telemetry: {
      'WM-1:count': { count: 2 },
      'WM-1:list': (q) => ({ things: things.slice(0, q.limit) })
    }
  })

  const site = await loadSite(client, { status: true })

  t.alike(site.byFamily.miner, things.map((thg) => ({ ...thg, workerId: 'whatsminer-worker' })))
  t.alike(site.pools, [{ workerId: 'ocean-pool-worker', deviceId: 'ocean-1' }])
  t.is(site.workers.length, 4)
  t.alike(client.calls.find((c) => c.type === 'list'), { id: 'WM-1', type: 'list', limit: 2, status: true })
  t.absent(client.calls.some((c) => c.id === 'G-1' || c.id === 'D-1'), 'dead and terminated workers are not queried')
})

test('loadSite - a failed count falls back to the device count; no status unless asked', async (t) => {
  const client = fakeClient({
    workers: [{ workerId: 'whatsminer-worker', deviceIds: ['WM-1', 'WM-2', 'WM-3'] }],
    telemetry: { 'WM-1:count': new Error('ERR_TIMEOUT'), 'WM-1:list': { things: [] } }
  })
  const site = await loadSite(client)
  t.alike(client.calls.find((c) => c.type === 'list'), { id: 'WM-1', type: 'list', limit: 3 })
  t.alike(site.byFamily, {}, 'a miner worker with no things adds nothing')
})

test('loadSite - an empty container worker still gets a stub card', async (t) => {
  const containerCfg = { config: { contract: { deviceFamily: 'container' } } }
  const client = fakeClient({
    workers: [
      { workerId: 'container-worker', deviceIds: ['CT-1'] },
      // No devices: the anchor is the workerId itself, so there is no card to stub.
      { workerId: 'empty-container-worker' }
    ],
    telemetry: { 'CT-1:config': containerCfg, 'empty-container-worker:config': containerCfg }
  })
  const site = await loadSite(client)
  t.alike(site.byFamily.container, [
    { id: 'CT-1', code: 'CT-1', info: { container: 'CT-1' }, last: {}, workerId: 'container-worker' }
  ])
})

test('loadSite - adapts an unclassified worker that reports hashrate_rt into miner cards', async (t) => {
  const client = fakeClient({
    workers: [{ workerId: 'rig-worker', deviceIds: ['rig-0', 'rig-1'] }],
    capabilities: { 'rig-0': { capabilities: { telemetry: [{ name: 'hashrate_rt' }, { name: 'power' }] } } },
    telemetry: {
      'rig-0:metrics': { metrics: { hashrate_rt: 100, power: 3000, temperature: 60, power_mode: 'eco' } },
      'rig-1:metrics': new Error('ERR_OFFLINE')
    }
  })

  const [hot, cold] = (await loadSite(client)).byFamily.miner

  t.alike(hot, {
    id: 'rig-0',
    code: 'rig-0',
    info: { container: 'rack-rig', pos: '1' },
    last: {
      snap: {
        stats: { status: 'mining', power_w: 3000, hashrate_mhs: { t_5m: 100e6 }, temperature_c: { avg: 60 } },
        config: { power_mode: 'low' }
      }
    },
    workerId: 'rig-worker'
  })
  t.is(cold.last.snap.stats.status, 'offline', 'a device whose pull fails shows offline')
  t.is(cold.last.snap.config.power_mode, null)
})

test('loadSite - skips an unclassified worker without hashrate_rt, or whose capabilities fail', async (t) => {
  const client = fakeClient({
    workers: [
      { workerId: 'meter-worker', deviceIds: ['M-1'] },
      { workerId: 'broken-worker', deviceIds: ['B-1'] }
    ],
    capabilities: {
      'M-1': { capabilities: { telemetry: [{ name: 'power' }] } },
      'B-1': new Error('ERR_UNREACHABLE')
    }
  })
  t.alike((await loadSite(client)).byFamily, {})
})
