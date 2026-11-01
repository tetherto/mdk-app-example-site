'use strict'

const test = require('brittle')
const path = require('path')
const { resolveApps, appNames } = require('../../deploy/apps')

const ROOT = path.join(__dirname, '..', '..')

test('resolveApps - a local app directory is named after its basename and mounted at /', (t) => {
  t.alike(resolveApps(['backend/apps/site'], ROOT), [
    { name: 'site', appDir: path.join(ROOT, 'backend/apps/site'), mount: '/', config: {}, mcp: true }
  ])
})

test('resolveApps - an installed package resolves to its directory, with its config and options', (t) => {
  const [app] = resolveApps([
    { name: 'op-center', package: '@tetherto/mdk-app-operation-center', config: { siteName: 'S' }, mcp: false }
  ], ROOT)
  t.is(app.name, 'op-center')
  t.is(app.appDir, path.dirname(require.resolve('@tetherto/mdk-app-operation-center/package.json', { paths: [ROOT] })))
  t.is(app.mount, undefined, 'no mount: the Gateway serves it at /apps/<name>')
  t.alike(app.config, { siteName: 'S' })
  t.is(app.mcp, false)
})

test('resolveApps - a { dir } entry without a name takes the directory basename', (t) => {
  const [app] = resolveApps([{ dir: 'backend/apps/site', mount: '/x' }], ROOT)
  t.is(app.name, 'site')
  t.is(app.mount, '/x')
})

test('resolveApps - rejects an entry with no source, a bad name, or a duplicate name', (t) => {
  t.exception(() => resolveApps([{ name: 'x' }], ROOT), /ERR_APP_SOURCE_REQUIRED/)
  t.exception(() => resolveApps([{ name: 'Bad_Name', dir: 'backend/apps/site' }], ROOT), /ERR_APP_NAME_INVALID/)
  t.exception(() => resolveApps(['backend/apps/site', { dir: 'backend/apps/site' }], ROOT), /ERR_APP_NAME_DUPLICATE/)
})

test('resolveApps / appNames - no entries means no apps', (t) => {
  t.alike(resolveApps(), [])
  t.alike(appNames(), [])
})

test('appNames - names without resolving packages', (t) => {
  t.alike(appNames([
    'backend/apps/site',
    { name: 'op-center', package: '@tetherto/mdk-app-operation-center' },
    { dir: 'apps/heat' },
    { package: '@scope/not-installed' }
  ]), ['site', 'op-center', 'heat', 'not-installed'])
})
