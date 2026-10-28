'use strict'

const test = require('brittle')
const path = require('node:path')

const { createModuleContext } = require('@tetherto/mdk-worker/lib/module-context')

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'backend', 'mcp-plugins', 'site')

function loadSite (client = {}) {
  const ctx = createModuleContext({
    dir: PLUGIN_DIR,
    ambient: {
      '@tetherto/mdk-mcp/plugin': { config: {} },
      '@tetherto/mdk-client': { createMdkClient: () => client }
    },
    label: '[test:site-lib]'
  })
  return ctx.load(path.join(PLUGIN_DIR, 'lib', 'site.js'))
}

test('classifyWorker - maps a worker id onto its device family', (t) => {
  const { classifyWorker } = loadSite()
  t.is(classifyWorker('satec-powermeter-worker'), 'powermeter')
  t.is(classifyWorker('emcd-pool'), 'pool')
  t.is(classifyWorker('temperature-probe'), 'sensor')
  t.is(classifyWorker('bitdeer-container'), 'container')
  t.is(classifyWorker('whatsminer-worker'), 'miner')
  t.is(classifyWorker('mystery'), 'other')
})

test('collectDevices - one row per device, readiness as online/offline', (t) => {
  const { collectDevices } = loadSite()
  const rows = collectDevices({
    workers: [
      { workerId: 'miner-worker', state: 'READY', deviceIds: ['m0', 'm1'] },
      { workerId: 'container-worker', state: 'DISCOVERED', deviceIds: ['c0'] },
      { workerId: 'pool-worker', state: 'READY' }
    ]
  })
  t.alike(rows, [
    { deviceId: 'm0', family: 'miner', state: 'online', worker: 'miner-worker' },
    { deviceId: 'm1', family: 'miner', state: 'online', worker: 'miner-worker' },
    { deviceId: 'c0', family: 'container', state: 'offline', worker: 'container-worker' }
  ])
  t.alike(collectDevices(null), [])
})

test('matches - filters by family and state, with all as a wildcard', (t) => {
  const { matches } = loadSite()
  const row = { family: 'miner', state: 'online' }
  t.ok(matches(row, 'all', 'all'))
  t.ok(matches(row, 'miner', 'online'))
  t.absent(matches(row, 'container', 'all'))
  t.absent(matches(row, 'all', 'offline'))
})

test('plural and counted - nouns agree with their counts', (t) => {
  const { plural, counted } = loadSite()
  t.is(plural('all', 2), 'devices')
  t.is(plural('miner', 1), 'miner')
  t.is(counted(0, 'worker'), 'no workers')
  t.is(counted(1, 'worker'), '1 worker')
  t.is(counted(3, 'worker'), '3 workers')
})

test('readMetric - takes the first numeric field for the metric', (t) => {
  const { readMetric } = loadSite()
  t.is(readMetric({ metrics: { hashrate_rt: 90, hashrate: 80 } }, 'hashrate'), 90)
  t.is(readMetric({ active_power: 3100 }, 'power'), 3100)
  t.is(readMetric({ metrics: { temperature: 'hot' } }, 'temperature'), null)
  t.is(readMetric(null, 'uptime'), null)
})

test('mapInBatches - maps every item, in order, a bounded batch at a time', async (t) => {
  const { mapInBatches } = loadSite()
  let inFlight = 0
  let peak = 0
  const items = Array.from({ length: 20 }, (_, i) => i)
  const out = await mapInBatches(items, async (i) => {
    peak = Math.max(peak, ++inFlight)
    await new Promise((resolve) => setImmediate(resolve))
    inFlight--
    return i * 2
  })
  t.alike(out, items.map((i) => i * 2))
  t.ok(peak <= 8, `at most 8 in flight (saw ${peak})`)
})

test('powerModesFor - reads modes from the contract brand, or says it cannot', async (t) => {
  const brands = { a: 'Whatsminer', b: 'Unknown' }
  const { powerModesFor } = loadSite({
    pullTelemetry: async (id) => {
      if (id === 'broken') throw new Error('down')
      return { config: { contract: { brand: brands[id] } } }
    }
  })
  t.alike(await powerModesFor('a'), { deviceId: 'a', brand: 'Whatsminer', supportedPowerModes: ['low', 'normal', 'high', 'sleep'] })
  t.is((await powerModesFor('b')).supportedPowerModes, null)
  t.is((await powerModesFor('broken')).reason, 'device type not recognised')
})

test('isEmpty and json', (t) => {
  const { isEmpty, json } = loadSite()
  t.ok(isEmpty(null))
  t.ok(isEmpty({}))
  t.absent(isEmpty({ a: 1 }))
  t.absent(isEmpty(0))
  t.alike(JSON.parse(json({ a: 1 }).content[0].text), { a: 1 })
})
