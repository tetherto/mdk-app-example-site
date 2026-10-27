'use strict'

const test = require('brittle')
const { withAppRoles } = require('../../start')

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
