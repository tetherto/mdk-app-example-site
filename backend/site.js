'use strict'

// Shared boot primitives for the mvp-site example — device seeding, Kernel/Worker
// boot, mock servers. Used by deploy/run-process.js (one process per PM2 role); config
// values (ports, discovery mode, worker/mock settings) come from
// config/site.deploy.json, the single source of truth for this example's
// topology (root dir, discovery mode, ports, plugin/static dirs, and the PM2
// app list).

const path = require('path')
const fs = require('fs')
const debug = require('debug')('mdk:example:mvp-site')
const YAML = require('yaml')
const { generateCredential } = require('@tetherto/mdk-identity')
const { appGrant } = require('@tetherto/mdk-rbac')
const { resolveApps } = require('../deploy/apps')
const { getKernel } = require('@tetherto/mdk-core')
const {
  publishWorkerKey, keysDir, trustedKeysDir, readTrustedKeys, waitForKernelKey, trustKernel, trustKeysFromDir
} = require('@tetherto/mdk-core/lib/local-discovery')

// Workers installed from github.com rather than the npm registry; checked
// up front so a missing one is named instead of surfacing as MODULE_NOT_FOUND.
const GIT_DEPS = ['whatsminer-mdk-worker', 'antminer-mdk-worker', 'sealminer-mdk-worker', 'emcd-mdk-worker', 'spiderpool-mdk-worker', 'foundry-mdk-worker', 'ocean-mdk-worker']

const missingGitDeps = GIT_DEPS.filter((name) => {
  try {
    require.resolve(`${name}/package.json`)
    return false
  } catch {
    return true
  }
})
if (missingGitDeps.length) {
  console.error('\n  Git dependencies are missing — the example cannot boot:\n')
  for (const name of missingGitDeps) console.error('    - %s', name)
  console.error('\n  They install from github.com, not the npm registry. To fix, run "npm run setup" in the project root with access to github.com.\n')
  process.exit(1)
}

const { startWhatsminerWorker } = require('./adapters/whatsminer-adapter')
const { startAntminerWorker } = require('./adapters/antminer-adapter')
const { startSealminerWorker } = require('./adapters/sealminer-adapter')
const { startPoolPluginWorker } = require('./adapters/pool-adapter')
const { startOceanWorker } = require('./adapters/ocean-adapter')
const emcd = require('emcd-mdk-worker')
const spiderpool = require('spiderpool-mdk-worker')
const foundry = require('foundry-mdk-worker')
const wmMock = require('whatsminer-mdk-worker/mock/api-v3-server')
const amMock = require('antminer-mdk-worker/mock/cgi-server')
const smMock = require('sealminer-mdk-worker/mock/server')
const emcdMock = require('emcd-mdk-worker/mock/server')
const emcdMockKeys = require('emcd-mdk-worker/mock/keys')
const spiderpoolMock = require('spiderpool-mdk-worker/mock/server')
const spiderpoolMockKeys = require('spiderpool-mdk-worker/mock/keys')
const foundryMock = require('foundry-mdk-worker/mock/server')
const foundryMockKeys = require('foundry-mdk-worker/mock/keys')
const emcdMockState = require('emcd-mdk-worker/mock/state')
const spiderpoolMockState = require('spiderpool-mdk-worker/mock/state')
const foundryMockState = require('foundry-mdk-worker/mock/state')
const oceanMock = require('ocean-mdk-worker/mock/server')

// MDK's SATEC power-meter worker isn't on npm and can't be a package.json
// dependency (see deploy/fetch-satec.js, which vendors it). Loaded on use, so
// a site without it fetched still boots every other role.
const satec = (file = '') => {
  const { SATEC_DIR } = require('../deploy/fetch-satec')
  try {
    return require(path.join(SATEC_DIR, file))
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err
    throw new Error('ERR_SATEC_MISSING: the SATEC worker is not fetched — run "npm run setup:satec"', { cause: err })
  }
}

const exampleDir = path.join(__dirname, '..')
const deploy = require(path.join(exampleDir, 'config', 'site.deploy.json'))

const ROOT = path.join(exampleDir, deploy.root)
// Gateway apps: { name, appDir, mount, config, mcp } — see deploy/apps.js.
const APPS = resolveApps(deploy.gateway.pluginDirs, exampleDir)
const MCP_PLUGIN_DIRS = (deploy.mcp.agentTools?.pluginDirs || []).map((p) => path.join(exampleDir, p))
const STATIC_ROOT_PATH = path.join(exampleDir, deploy.gateway.staticRootPath)

const HOST = deploy.host
const MOCK_PORT_BASE = deploy.mocks.portBase
// `antminer` is optional so a local site.deploy.json seeded before it
// existed still boots (its pm2.roles just won't list the antminer roles).
const ANTMINER_MOCK_PORT_BASE = deploy.antminer?.mocks?.portBase
// Optional for the same reason as `antminer`.
const SEALMINER_MOCK_PORT_BASE = deploy.sealminer?.mocks?.portBase
// Optional for the same reason as `antminer`.
const SATEC_MOCK_PORT_BASE = deploy.satec?.mocks?.portBase
const GATEWAY_PORT = deploy.gateway.port
const GATEWAY_HOST = deploy.gateway.host
// The gateway serves only these Host headers (loopback on its port is always in).
// A LAN deploy lists the names/addresses the UI is opened with.
const GATEWAY_ALLOWED_HOSTS = deploy.gateway.allowedHosts || []
// No auth verifier is passed: since @tetherto/mdk-gateway 0.13 a Gateway
// started with a Kernel checks every route against spec.rbac, and the named
// 'loopback' verifier was removed (passing any name fails the boot with
// ERR_GATEWAY_AUTH_VERIFIER_INVALID). A stale gateway.authVerifier left in a
// local site.deploy.json is ignored.
const MCP_AGENT_TOOLS_PORT = deploy.mcp.agentTools?.port
const DISCOVERY = deploy.discovery
const WORKER_ID = deploy.worker.id
const ANTMINER_WORKER_ID = deploy.antminer?.worker?.id
const SEALMINER_WORKER_ID = deploy.sealminer?.worker?.id
// Optional like `antminer`: a site.deploy.json seeded before these pools
// existed still boots, its pm2.roles just don't list their roles.
const EMCD_WORKER_ID = deploy.emcd?.worker?.id
const SPIDERPOOL_WORKER_ID = deploy.spiderpool?.worker?.id
const FOUNDRY_WORKER_ID = deploy.foundry?.worker?.id
const OCEAN_WORKER_ID = deploy.ocean?.worker?.id
const SATEC_WORKER_ID = deploy.satec?.worker?.id

// config/devices.json is gitignored (local/per-dev config) — see README "Seed devices".
// worker.pools is the default pool config; opts.conf.pools overrides per device.
const loadSeedDevices = () => {
  const devices = require(path.join(__dirname, '..', 'config', 'devices.json'))
  const assignPorts = (list, portBase) => (list || []).map((d, i) => ({
    ...d,
    opts: { ...d.opts, port: d.opts.port ?? portBase + i }
  }))
  const assignPools = (list) => deploy.worker.pools
    ? list.map((d) => ({
      ...d,
      opts: { ...d.opts, conf: { pools: deploy.worker.pools, ...d.opts.conf } }
    }))
    : list
  return {
    miners: assignPools(assignPorts(devices.miners, MOCK_PORT_BASE)),
    antminers: assignPools(assignPorts(devices.antminers, ANTMINER_MOCK_PORT_BASE)),
    // The SealMiner contract takes pools through its setupPools command, not
    // device config, so worker.pools isn't applied here.
    sealminers: assignPorts(devices.sealminers, SEALMINER_MOCK_PORT_BASE),
    powermeters: assignPorts(devices.powermeters, SATEC_MOCK_PORT_BASE)
  }
}

// --- mock device servers ------------------------------------------------------

const mockHandles = (mocks) => {
  const ready = Promise.all(mocks.map((m) => m.ready))
  const close = () => { for (const m of mocks) { try { m.exit() } catch {} } }
  return { mocks, ready, close }
}

// whatsminer-mdk-worker's mock takes a raw state override (no type/serial
// shorthand) and exposes close() instead of exit() — normalize both here so
// mockHandles()/startMocks() callers don't need to know which mock backs them.
const startMocks = (miners) => {
  return mockHandles(miners.map((d) => {
    const mock = wmMock.createServer({
      port: d.opts.port,
      host: HOST,
      password: d.opts.password ?? deploy.mocks.defaultPassword,
      state: { deviceInfo: { miner: { type: deploy.mocks.type, 'miner-sn': d.info.serialNum } } }
    })
    return { ...mock, exit: () => mock.close() }
  }))
}

// antminer-mdk-worker's mock speaks the stock-firmware HTTP CGI API with
// digest auth; the serial and model are a raw state override, same as the
// Whatsminer mock above.
const startAntminerMocks = (miners) => {
  return mockHandles(miners.map((d) => {
    const mock = amMock.createServer({
      port: d.opts.port,
      host: HOST,
      username: d.opts.username,
      password: d.opts.password ?? deploy.antminer.mocks.defaultPassword,
      state: { systemInfo: { serinum: d.info.serialNum } }
    })
    return { ...mock, exit: () => mock.close() }
  }))
}

// sealminer-mdk-worker's mock speaks the bdminer 4028 TCP JSON API (no auth).
// It has no serial override, so devices are told apart by deviceId alone.
const startSealminerMocks = (miners) => {
  return mockHandles(miners.map((d) => smMock.createServer({
    port: d.opts.port,
    host: HOST,
    series: String(d.opts.series || deploy.sealminer.worker.series).toLowerCase(),
    firmware: deploy.sealminer.mocks.firmware
  })))
}

// One SATEC Modbus mock per seed entry under `powermeters`. Unless
// satec.mocks.powerW pins it, the meters split the fleet's draw: about
// AVG_MINER_POWER_W per seeded miner.
const AVG_MINER_POWER_W = 3400
const startSatecMocks = (powermeters, minerCount) => {
  const satecMock = satec('mock/server')
  const powerW = deploy.satec.mocks.powerW ?? (minerCount * AVG_MINER_POWER_W) / (powermeters.length || 1)
  return mockHandles(powermeters.map((d) => satecMock.createServer({
    port: d.opts.port,
    host: HOST,
    type: deploy.satec.worker.model,
    powerW
  })))
}

// The EMCD, SpiderPool and Foundry mocks answer only for the accounts they are
// started with (each defaults to one fixture account), so they are seeded
// from the same <pool>.pool.accounts list the worker polls: renaming an
// account in site.deploy.json renames it on both sides. createServer() is
// async and returns { app, apiUrl }.
const startPoolPluginMock = (mock, port, opts = {}) => {
  const server = mock.createServer({ port, host: HOST, ...opts })
  return mockHandles([{ ready: server, exit: () => server.then(({ app }) => app.close()) }])
}

// Foundry accounts may be { name, apiKey } entries instead of plain names.
const accountNames = (section) => (section.pool.accounts || []).map((a) => (typeof a === 'string' ? a : a.name))
const forAccounts = (names, value) => Object.fromEntries(names.map((name) => [name, value(name)]))

// An empty list is EMCD's master account (subaccount ID '').
const startEmcdMock = () => {
  const names = accountNames(deploy.emcd)
  return startPoolPluginMock(emcdMock, deploy.emcd.mock.port, {
    accounts: forAccounts(names.length ? names : [''], () => emcdMockState())
  })
}

const startSpiderpoolMock = () => startPoolPluginMock(spiderpoolMock, deploy.spiderpool.mock.port, {
  accounts: forAccounts(accountNames(deploy.spiderpool), () => spiderpoolMockState())
})

// Every account accepts the fixture keys bootFoundryWorker falls back to when
// FOUNDRY_API_KEY is unset; a per-account apiKey in the config is honoured.
const startFoundryMock = () => {
  const entries = deploy.foundry.pool.accounts || []
  const names = accountNames(deploy.foundry)
  const keyOf = (name) => entries.find((a) => typeof a === 'object' && a.name === name)?.apiKey || foundryMockKeys.apiKey
  return startPoolPluginMock(foundryMock, deploy.foundry.mock.port, {
    accounts: forAccounts(names, (name) => foundryMockState({ name })),
    apiKeys: forAccounts(names, keyOf),
    technicianKeys: forAccounts(names, () => foundryMockKeys.technicianKey)
  })
}

// ocean-mdk-worker's mock serves the Ocean (and DATUM) routes with a `test`
// fixture account. Its createServer() is synchronous and listens via a
// callback, so wait on the server's 'listening' event; its exit() calls
// process.exit, so close the fastify app instead.
const startOceanMock = () => {
  const { app } = oceanMock.createServer({ port: deploy.ocean.mock.port, host: HOST, delay: 0 })
  const ready = new Promise((resolve, reject) => {
    if (app.server.listening) return resolve()
    app.server.once('listening', resolve)
    app.server.once('error', reject)
  })
  return mockHandles([{ ready, exit: () => app.close() }])
}

// --- Kernel identity: service accounts + spec.rbac -----------------------------
//
// Since @tetherto/mdk 0.13 the Kernel authorizes every request by the caller's
// access token against spec.rbac (default deny). The `mdk` CLI normally writes
// the credentials and policy; this example boots without it, so it does the
// same here: one Ed25519 service account per app runtime (`app:<name>`) and
// one for the MCP tool plugins, created once under <root>/credentials and
// registered with the Kernel by public key.

const MCP_SERVICE_ACCOUNT = 'mcp-site-tools'

const credentialFile = (root, name) => path.join(root, 'credentials', `${name.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)

// Every PM2 role starts at once and several read the same credential, so it
// is created atomically: written to a temp file, then hard-linked into place
// (fails with EEXIST if another process won the race, whose file is read).
const ensureCredential = (root, name) => {
  const file = credentialFile(root, name)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const { publicKey, privateKeyPem } = generateCredential()
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ name, publicKey, privateKeyPem }), { mode: 0o600 })
    try {
      fs.linkSync(tmp, file)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  const cred = JSON.parse(fs.readFileSync(file, 'utf8'))
  return { file, name: cred.name, publicKey: cred.publicKey, privateKey: cred.privateKeyPem }
}

// The MCP tool plugins (get_device, act_device, ...) read workers and devices
// and send device commands; act_device stays withheld unless the MCP server
// is started with allowWrite/allowTools.
const MCP_TOOLS_ROLE = {
  name: 'mcp-site-tools',
  rules: [
    { resources: ['workers'], verbs: ['list', 'read'] },
    { resources: ['devices'], verbs: ['read', 'write'] }
  ]
}

// spec.rbac: each app gets what its mdk-app.yaml `permissions` request (the
// role `mdk add app` would write), and the MCP tools get MCP_TOOLS_ROLE.
const sitePolicy = () => {
  const roles = [MCP_TOOLS_ROLE]
  const bindings = [{ role: MCP_TOOLS_ROLE.name, subjects: [{ kind: 'ServiceAccount', name: MCP_SERVICE_ACCOUNT }] }]
  for (const app of APPS) {
    const manifest = YAML.parse(fs.readFileSync(path.join(app.appDir, 'mdk-app.yaml'), 'utf8'))
    const { role, binding } = appGrant(app.name, manifest.permissions || [])
    if (role) {
      roles.push(role)
      bindings.push(binding)
    }
  }
  return { enforcement: 'deny', roles, bindings }
}

const siteServiceAccounts = (root) => [
  ...APPS.map((app) => `app:${app.name}`),
  MCP_SERVICE_ACCOUNT
].map((name) => {
  const { publicKey } = ensureCredential(root, name)
  return { name, publicKey }
})

// --- Kernel + worker boot ------------------------------------------------------

// Start the Kernel over HRPC. `mode`: 'local' (register the worker by the RPC
// key it publishes to the shared dir) or 'dht' (Hyperswarm topic; `topic` pins it).
const bootKernel = async ({ root, topic, mode = DISCOVERY } = {}) => {
  // The example's processes exit on Ctrl-C/SIGTERM — opt in explicitly.
  const opts = {
    root,
    storeDir: path.join(root, 'kernel-db'),
    handleSignals: true,
    rbac: sitePolicy(),
    serviceAccounts: siteServiceAccounts(root)
  }
  if (mode === 'local') {
    opts.discovery = { mode: 'local' }
  } else {
    opts.topicFile = path.join(root, '.dht-topic')
    if (topic) opts.topic = topic
    // Topic admission is fail-closed. The demo's workers run in their own
    // processes and their RPC keys are not known here, so admit any Worker on
    // the topic (logs a warning). A real site lists them in workerKeys.
    opts.discovery = { mode: 'dht', allowAnyWorker: true }
  }
  return getKernel(opts)
}

// Worker RPC is fail-closed: before booting, collect the keys the worker must
// admit — in-process, the Kernel's client key plus the write-capable callers it
// already admitted (the Gateway calls workers directly too); out of process,
// what the Kernel and Gateway published to the trusted-keys dir (waiting for
// the Kernel's kernel.pub so PM2 start order does not matter).
const workerTrust = async ({ kernel, root }) => {
  if (kernel) return [kernel.getClientPublicKey(), ...kernel.listAllowedKeys('write')]
  const dir = trustedKeysDir(root)
  await waitForKernelKey(dir, { timeoutMs: 60000 })
  return readTrustedKeys(dir).map((k) => k.key)
}

// ...and keep following later admissions (a Gateway that boots after the worker).
const followTrust = (handle, { kernel, root }) => {
  const follower = kernel ? trustKernel(handle.runtime, kernel) : trustKeysFromDir(handle.runtime, trustedKeysDir(root))
  const stop = handle.stop.bind(handle)
  handle.stop = async (...args) => {
    follower.stop()
    return stop(...args)
  }
}

const registerWorker = async (handle, workerId, { kernel, root, mode }) => {
  followTrust(handle, { kernel, root })
  const rpcKey = handle.runtime.getPublicKey().toString('hex')
  if (kernel) {
    await kernel.registerWorker(handle.runtime.getPublicKey())
    if (Array.isArray(kernel._cleanup)) kernel._cleanup.push(() => handle.stop())
  } else {
    if (mode === 'local') publishWorkerKey(keysDir(root), workerId, rpcKey)
    const stop = () => { handle.stop().finally(() => process.exit(0)) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
}

const workerStoreDir = (root, workerId) => {
  const storeDir = path.join(root, 'workers', workerId, 'store')
  fs.mkdirSync(storeDir, { recursive: true })
  return storeDir
}

// whatsminer-mdk-worker's device list is fixed at construction (no
// provisioning store), so model/allowDuplicateIPs/thing-timer config from the
// retired internal package no longer apply — pools already travel per-device
// via loadSeedDevices()'s opts.conf.pools.
const bootWorker = async ({ kernel, kernelTopic, root, mode = DISCOVERY, devices }) => {
  const handle = await startWhatsminerWorker({
    allowedKeys: await workerTrust({ kernel, root }),
    workerId: WORKER_ID,
    storeDir: workerStoreDir(root, WORKER_ID),
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null,
    seedDevices: devices
  })

  await registerWorker(handle, WORKER_ID, { kernel, root, mode })
  return handle
}

// Same fixed-device-list model as bootWorker; worker.type tags every device
// (e.g. miner-am-s21) so the plugin resolves its rated J/TH for `snap`.
const bootAntminerWorker = async ({ kernel, kernelTopic, root, mode = DISCOVERY, devices }) => {
  const handle = await startAntminerWorker({
    allowedKeys: await workerTrust({ kernel, root }),
    workerId: ANTMINER_WORKER_ID,
    storeDir: workerStoreDir(root, ANTMINER_WORKER_ID),
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null,
    type: deploy.antminer.worker.type,
    seedDevices: devices
  })

  await registerWorker(handle, ANTMINER_WORKER_ID, { kernel, root, mode })
  return handle
}

// Same fixed-device-list model as bootAntminerWorker; worker.series is
// declared on every device so the plugin doesn't infer it from the model.
const bootSealminerWorker = async ({ kernel, kernelTopic, root, mode = DISCOVERY, devices }) => {
  const handle = await startSealminerWorker({
    allowedKeys: await workerTrust({ kernel, root }),
    workerId: SEALMINER_WORKER_ID,
    storeDir: workerStoreDir(root, SEALMINER_WORKER_ID),
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null,
    series: deploy.sealminer.worker.series,
    seedDevices: devices
  })

  await registerWorker(handle, SEALMINER_WORKER_ID, { kernel, root, mode })
  return handle
}

// The pool workers' real fetch/save cron is slower than a demo wants, so
// drive the same methods on a fast non-overlapping cadence. stop() clears the
// interval AND awaits a tick already in flight — clearInterval alone only
// stops *future* ticks, so a tick mid-fetchStats would otherwise keep running
// against HTTP resources the caller tears down right after.
const drivePool = (pool, tickMs) => {
  let inFlight = null
  const tick = () => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const now = new Date()
        await pool.fetchWorkers(now)
        await pool.fetchStats(now)
        await pool.saveStats(now)
      } catch (e) {
        debug('pool tick error: %s', e.message)
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }
  tick()
  const timer = setInterval(tick, tickMs)
  timer.unref()
  return {
    stop: async () => {
      clearInterval(timer)
      if (inFlight) await inFlight
    }
  }
}

// registerWorker's SIGINT/kernel._cleanup paths both call handle.stop() by a
// fresh property lookup each time, so wrapping it here — after
// registerWorker already wired its own caller — still takes effect. Stop
// the pacer (interval + any in-flight tick) before the underlying stop
// logic runs, so nothing races whatever handle.stop() tears down.
const withPoolDriver = (handle, tickMs) => {
  const poolDriver = drivePool(handle.pool, tickMs)
  const stopWorker = handle.stop.bind(handle)
  handle.stop = async (...args) => {
    await poolDriver.stop()
    return stopWorker(...args)
  }
  return handle
}

// Credentials come from the environment, never from site.deploy.json. Unset,
// they fall back to the package's public mock fixtures, which only the
// bundled mock accepts.
const poolCredentials = (name, env, mockKeys) => {
  const missing = Object.keys(env).filter((key) => !process.env[env[key]])
  if (!missing.length) return Object.fromEntries(Object.entries(env).map(([key, envName]) => [key, process.env[envName]]))
  console.warn('%s: %s unset, using the mock fixture credentials', name, missing.map((key) => env[key]).join(', '))
  return mockKeys
}

const bootPoolPluginWorker = async ({ kernel, kernelTopic, root, mode, pkg, workerId, section, conf }) => {
  const handle = await startPoolPluginWorker({
    Pool: pkg.Pool,
    plugin: pkg.plugin,
    allowedKeys: await workerTrust({ kernel, root }),
    workerId,
    rack: section.worker.rack,
    storeDir: workerStoreDir(root, workerId),
    conf,
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null
  })

  await registerWorker(handle, workerId, { kernel, root, mode })
  return withPoolDriver(handle, section.worker.tickMs)
}

const bootEmcdWorker = ({ kernel, kernelTopic, root, mode = DISCOVERY }) => {
  const credentials = poolCredentials('emcd', { apiKey: 'EMCD_API_KEY', apiSecret: 'EMCD_API_SECRET' }, emcdMockKeys)
  return bootPoolPluginWorker({
    kernel,
    kernelTopic,
    root,
    mode,
    pkg: { Pool: emcd.EMCD_POOL, plugin: emcd.plugin },
    workerId: EMCD_WORKER_ID,
    section: deploy.emcd,
    conf: { emcd: { ...deploy.emcd.pool, ...credentials } }
  })
}

const bootSpiderpoolWorker = ({ kernel, kernelTopic, root, mode = DISCOVERY }) => {
  const credentials = poolCredentials(
    'spiderpool',
    { accessKey: 'SPIDERPOOL_ACCESS_KEY', privateKey: 'SPIDERPOOL_PRIVATE_KEY' },
    { accessKey: spiderpoolMockKeys.TEST_ACCESS_KEY, privateKey: spiderpoolMockKeys.TEST_PRIVATE_KEY }
  )
  return bootPoolPluginWorker({
    kernel,
    kernelTopic,
    root,
    mode,
    pkg: { Pool: spiderpool.SPIDER_POOL, plugin: spiderpool.plugin },
    workerId: SPIDERPOOL_WORKER_ID,
    section: deploy.spiderpool,
    conf: { spiderpool: { ...deploy.spiderpool.pool, ...credentials } }
  })
}

// One credential (a sub-account API key or an `fdpat_` personal access token)
// shared by every name in foundry.pool.accounts. Per-sub-account keys go in
// the accounts list as { name, apiKey } entries instead.
const bootFoundryWorker = ({ kernel, kernelTopic, root, mode = DISCOVERY }) => {
  const credentials = poolCredentials('foundry', { apiKey: 'FOUNDRY_API_KEY' }, { apiKey: foundryMockKeys.apiKey })
  return bootPoolPluginWorker({
    kernel,
    kernelTopic,
    root,
    mode,
    pkg: { Pool: foundry.FOUNDRY_POOL, plugin: foundry.plugin },
    workerId: FOUNDRY_WORKER_ID,
    section: deploy.foundry,
    conf: { foundry: { ...deploy.foundry.pool, ...credentials } }
  })
}

// Ocean is a contract-first (WorkerRuntimeV2) plugin with its own refresh
// loop, so it gets no drivePool pacer. The Ocean API is public (accounts are
// usernames); only the optional DATUM gateway takes credentials, passed as
// plugin env when both DATUM_USER and DATUM_PASSWORD are set.
const bootOceanWorker = async ({ kernel, kernelTopic, root, mode = DISCOVERY }) => {
  const env = process.env.DATUM_USER && process.env.DATUM_PASSWORD
    ? { DATUM_USER: process.env.DATUM_USER, DATUM_PASSWORD: process.env.DATUM_PASSWORD }
    : {}
  const handle = await startOceanWorker({
    allowedKeys: await workerTrust({ kernel, root }),
    workerId: OCEAN_WORKER_ID,
    storeDir: workerStoreDir(root, OCEAN_WORKER_ID),
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null,
    pool: deploy.ocean.pool,
    env
  })

  await registerWorker(handle, OCEAN_WORKER_ID, { kernel, root, mode })
  return handle
}

// The SATEC worker predates the contract-first workers: it runs on the MDK
// release's own worker runtime (vendored with it) and registers like the rest.
// A seed device with info.pos 'site' is the site meter the overview reads.
const bootSatecWorker = async ({ kernel, kernelTopic, root, mode = DISCOVERY, devices }) => {
  const { startSatecWorker } = satec()
  const handle = await startSatecWorker({
    allowedKeys: await workerTrust({ kernel, root }),
    workerId: SATEC_WORKER_ID,
    model: deploy.satec.worker.model,
    storeDir: workerStoreDir(root, SATEC_WORKER_ID),
    conf: {
      allowDuplicateIPs: deploy.satec.worker.allowDuplicateIPs,
      thing: deploy.satec.worker.thing
    },
    kernelTopic: (!kernel && mode !== 'local') ? kernelTopic : null,
    seedDevices: devices
  })

  await registerWorker(handle, SATEC_WORKER_ID, { kernel, root, mode })
  return handle
}

module.exports = {
  exampleDir,
  deploy,
  ROOT,
  HOST,
  MOCK_PORT_BASE,
  ANTMINER_MOCK_PORT_BASE,
  SEALMINER_MOCK_PORT_BASE,
  SATEC_MOCK_PORT_BASE,
  GATEWAY_PORT,
  GATEWAY_HOST,
  GATEWAY_ALLOWED_HOSTS,
  MCP_AGENT_TOOLS_PORT,
  APPS,
  MCP_PLUGIN_DIRS,
  STATIC_ROOT_PATH,
  DISCOVERY,
  WORKER_ID,
  ANTMINER_WORKER_ID,
  SEALMINER_WORKER_ID,
  EMCD_WORKER_ID,
  SPIDERPOOL_WORKER_ID,
  FOUNDRY_WORKER_ID,
  OCEAN_WORKER_ID,
  SATEC_WORKER_ID,
  MCP_SERVICE_ACCOUNT,
  ensureCredential,
  sitePolicy,
  loadSeedDevices,
  startMocks,
  startAntminerMocks,
  startSealminerMocks,
  startEmcdMock,
  startSpiderpoolMock,
  startFoundryMock,
  startOceanMock,
  startSatecMocks,
  bootKernel,
  bootWorker,
  bootAntminerWorker,
  bootSealminerWorker,
  bootEmcdWorker,
  bootSpiderpoolWorker,
  bootFoundryWorker,
  bootOceanWorker,
  bootSatecWorker
}
