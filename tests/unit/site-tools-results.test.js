'use strict'

const test = require('brittle')
const path = require('node:path')

const { createModuleContext } = require('@tetherto/mdk-worker/lib/module-context')

// The agent tool contract ships in the MDK repo's private @tetherto/mdk-agent
// package. Point MDK_REPO at an MDK checkout to run the contract checks;
// without it they are skipped.
const CONTRACT = process.env.MDK_REPO && path.join(path.resolve(process.env.MDK_REPO), 'backend/core/agent/src/tools.js')
const contractTest = CONTRACT ? test : test.skip
const PLUGIN_DIR = path.join(__dirname, '..', '..', 'backend', 'mcp-plugins', 'site')

function fleet (overrides = {}) {
  return {
    getStatus: async () => ({
      workers: [
        { workerId: 'miner-worker', state: 'READY', deviceIds: ['miner-0', 'miner-1'] },
        { workerId: 'container-worker', state: 'DISCOVERED', deviceIds: ['container-0'] }
      ]
    }),
    pullTelemetry: async (ref, arg) => (arg && arg.type === 'config'
      ? { config: { contract: { brand: 'Antminer' } } }
      : { metrics: { power: 3200, hashrate: 100 } }),
    pullState: async () => ({ up: true }),
    getCapabilities: async () => ({ reboot: true }),
    sendCommand: async () => ({ status: 'QUEUED' }),
    ...overrides
  }
}

function loadTool (file, client) {
  const ctx = createModuleContext({
    dir: PLUGIN_DIR,
    ambient: {
      '@tetherto/mdk-mcp/plugin': { config: {} },
      '@tetherto/mdk-client': { createMdkClient: () => client }
    },
    label: '[test:site-tools]'
  })
  return ctx.load(path.join(PLUGIN_DIR, 'tools', file))
}

async function call (file, args, client = fleet()) {
  const tool = loadTool(file, client)
  return JSON.parse((await tool.handler(args)).content[0].text)
}

const CASES = [
  ['summarize_site', 'summarize-site.js', {}],
  ['count_devices', 'count-devices.js', { family: 'all', state: 'all' }],
  ['list_devices', 'list-devices.js', { family: 'all', state: 'all' }],
  ['get_device', 'get-device.js', { ref: 'miner-0', attr: 'telemetry' }],
  ['rank_devices', 'rank-devices.js', { family: 'all', metric: 'power', order: 'desc', limit: 5 }],
  ['act_device', 'act-device.js', { ref: 'miner-0', action: 'reboot', mode: 'normal' }]
]

contractTest('every tool returns what the result contract requires of its verb', async (t) => {
  const { validateToolResult } = await import(CONTRACT)

  for (const [name, file, args] of CASES) {
    const { ok, errors } = validateToolResult(name, await call(file, args))
    t.ok(ok, `${name}: ${errors.join(' | ')}`)
  }
})

contractTest('get_device says a device reported nothing rather than narrating an empty reading', async (t) => {
  const { validateToolResult } = await import(CONTRACT)

  const empty = await call('get-device.js', { ref: 'miner-0', attr: 'telemetry' }, fleet({ pullTelemetry: async () => ({}) }))
  t.ok(empty.summary.includes('no readings'), 'an empty reading is stated, not dressed up')

  const nothing = await call('get-device.js', { ref: 'miner-0', attr: 'telemetry' }, fleet({ pullTelemetry: async () => null }))
  t.is(nothing.value, null, 'a client returning nothing still answers under value')
  t.ok(validateToolResult('get_device', nothing).ok, 'so the result stays contract-valid instead of failing the call')

  const live = await call('get-device.js', { ref: 'miner-0', attr: 'telemetry' })
  t.ok(live.summary.includes('Live readings'), 'a real reading still reads as one')
})

test('act_device reports how the write ended, and never reads an unsent one as sent', async (t) => {
  let dispatched = false
  const refuse = fleet({ sendCommand: async () => { dispatched = true; return { status: 'QUEUED' } } })

  const rejected = await call('act-device.js', { ref: 'miner-0', action: 'set_power_mode', mode: 'high' }, refuse)
  t.absent(dispatched, 'an unsupported mode never reaches the device')
  t.is(rejected.outcome, 'rejected', 'and is reported as rejected, not sent')

  const blank = await call('act-device.js', { ref: 'miner-0', action: 'reboot' }, fleet({ sendCommand: async () => ({ error: '' }) }))
  t.is(blank.outcome, 'failed', 'an error carrying no message is still an error')

  const coded = await call('act-device.js', { ref: 'miner-0', action: 'reboot' }, fleet({ sendCommand: async () => ({ status: 202 }) }))
  t.is(coded.outcome, '202', 'a status of a type we did not expect is surfaced, not called sent')

  const bare = await call('act-device.js', { ref: 'miner-0', action: 'reboot' }, fleet({ sendCommand: async () => ({}) }))
  t.is(bare.outcome, 'sent', 'only a reply carrying no status at all falls back to sent')
})
