'use strict'

const test = require('brittle')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { withAppRoles, buildApps, writeEcosystemConfig, waitForSite } = require('../../start')

test('withAppRoles - adds the app role an older config lacks, ahead of the gateway', (t) => {
  const roles = ['mocks', 'kernel', 'worker', 'gateway', 'mcp']
  t.alike(withAppRoles(roles, ['backend/apps/site']), ['mocks', 'kernel', 'worker', 'app-site', 'gateway', 'mcp'])
})

test('withAppRoles - keeps a config that already lists it, and drops an app role with no plugin dir', (t) => {
  const warnings = []
  const roles = ['kernel', 'app-site', 'app-gone', 'gateway']
  t.alike(withAppRoles(roles, ['backend/apps/site'], (w) => warnings.push(w)), ['kernel', 'app-site', 'gateway'])
  t.is(warnings.length, 1)
  t.ok(warnings[0].includes('app-gone'))
})

test('withAppRoles - appends app roles when there is no gateway role', (t) => {
  t.alike(withAppRoles(['kernel'], ['a/site', 'b/fleet']), ['kernel', 'app-site', 'app-fleet'])
})

test('buildApps - one PM2 app per role, sharing the deploy defaults and discovery env', (t) => {
  const deploy = {
    discovery: 'mdk-discovery',
    gateway: { pluginDirs: ['backend/apps/site'] },
    pm2: { script: 'backend/run.js', roles: ['kernel', 'gateway'], max_restarts: 3 }
  }
  const apps = buildApps(deploy)
  t.alike(apps.map((a) => a.name), ['kernel', 'app-site', 'gateway'])
  t.alike(apps[1].args, ['--role', 'app-site'])
  t.is(apps[0].script, path.join(path.dirname(require.resolve('../../start')), 'backend/run.js'))
  t.is(apps[0].max_restarts, 3)
  t.alike(apps[2].env, { MDK_DISCOVERY: 'mdk-discovery' })
  t.absent('roles' in apps[0])
})

test('buildApps - tolerates a gateway with no pluginDirs', (t) => {
  const apps = buildApps({ discovery: 'd', gateway: {}, pm2: { script: 's.js', roles: ['kernel'] } })
  t.alike(apps.map((a) => a.name), ['kernel'])
})

test('writeEcosystemConfig - writes a loadable PM2 config', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-start-'))
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'nested', 'ecosystem.config.js')
  const apps = [{ name: 'kernel', args: ['--role', 'kernel'] }]
  writeEcosystemConfig(apps, file)
  t.alike(require(file), { apps })
})

test('waitForSite - resolves true once the endpoint answers ok', async (t) => {
  let hits = 0
  const server = http.createServer((req, res) => {
    res.statusCode = ++hits < 2 ? 503 : 200
    res.end()
  })
  await new Promise((resolve) => server.listen(0, resolve))
  t.teardown(() => server.close())
  const url = `http://localhost:${server.address().port}/site/overview`
  t.is(await waitForSite(url, 5000, 10), true)
  t.ok(hits >= 2, 'kept polling past a non-ok response')
})

test('waitForSite - resolves false when nothing answers before the deadline', async (t) => {
  t.is(await waitForSite('http://127.0.0.1:1/', 50, 10), false)
})
