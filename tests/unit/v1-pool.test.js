'use strict'

const test = require('brittle')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadContract } = require('@tetherto/mdk-worker')

const dir = path.join(__dirname, '..', '..', 'workers', 'v1-pool')
const src = path.join(dir, 'src')
const { createServer } = require(path.join(dir, 'mock', 'server'))
const DEVICE = require.resolve('@tetherto/mdk-worker/device', { paths: [dir] })

// Loads the plugin's contract handlers for one device, with `opts` as the
// ambient '@tetherto/mdk-worker/device'. Not createInstance(): its module
// registry is private, and the test must stop the pool service it starts.
async function load (t, opts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1-pool-'))
  for (const key of Object.keys(require.cache)) if (key.startsWith(src)) delete require.cache[key]
  require.cache[DEVICE] = { id: DEVICE, filename: DEVICE, loaded: true, exports: { id: `${opts.kind}-pool-worker`, opts: { ...opts, dbPath: path.join(tmp, 'db') }, env: {}, config: {}, logger: () => {} } }

  const { entries } = await loadContract(dir)
  const telemetry = new Map([...entries.telemetry].map(([name, file]) => [name, require(file)]))
  const ready = require(path.join(src, 'pool')).ready
  t.teardown(async () => {
    const pool = await ready.catch(() => null)
    if (pool) await new Promise((resolve) => pool.stop(resolve))
    fs.rmSync(tmp, { recursive: true, force: true })
  })
  return telemetry
}

const KINDS = [
  { kind: 'emcd', port: 15065, apiPath: '/pool/v1', accounts: ['emcd'] },
  { kind: 'spiderpool', port: 15066, accounts: ['spider'] },
  { kind: 'foundry', port: 15067, accounts: ['foundry'] }
]

for (const opts of KINDS) {
  test(`v1-pool bridge - ${opts.kind} reads its pool through the vendor mock`, async (t) => {
    const mock = createServer({ host: '127.0.0.1', ...opts })
    await mock.ready
    t.teardown(() => mock.exit())

    const telemetry = await load(t, { host: '127.0.0.1', ...opts, tickMs: 3600000 })

    t.is(typeof await telemetry.get('hashrate')(), 'number')
    t.is(typeof await telemetry.get('workers_online')(), 'number')
    t.ok(await telemetry.get('stats')(), 'stats ext data')
  })
}

test('v1-pool bridge - rejects an unknown pool kind', async (t) => {
  const telemetry = await load(t, { kind: 'nope' })
  await t.exception(telemetry.get('hashrate')(), /ERR_POOL_KIND_INVALID/)
})
