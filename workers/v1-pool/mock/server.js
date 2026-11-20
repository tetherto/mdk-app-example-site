'use strict'

// The mock `mdk run` starts for this worker's device: the vendor's own pool API
// mock for `opts.kind`, answering for the accounts the worker polls. The vendor
// mocks start asynchronously and return { app, apiUrl }, so this maps them onto
// the { ready, exit } shape `mdk run` waits on.
const KINDS = {
  emcd: (names) => {
    const state = require('emcd-mdk-worker/mock/state')
    // An empty list is EMCD's master account (subaccount ID '').
    return { accounts: forAccounts(names.length ? names : [''], () => state()) }
  },
  spiderpool: (names) => {
    const state = require('spiderpool-mdk-worker/mock/state')
    return { accounts: forAccounts(names, () => state()) }
  },
  foundry: (names) => {
    const state = require('foundry-mdk-worker/mock/state')
    const keys = require('foundry-mdk-worker/mock/keys')
    return {
      accounts: forAccounts(names, (name) => state({ name })),
      apiKeys: forAccounts(names, () => keys.apiKey),
      technicianKeys: forAccounts(names, () => keys.technicianKey)
    }
  }
}

const PACKAGES = { emcd: 'emcd-mdk-worker', spiderpool: 'spiderpool-mdk-worker', foundry: 'foundry-mdk-worker' }

function forAccounts (names, value) {
  return Object.fromEntries(names.map((name) => [name, value(name)]))
}

function createServer (opts = {}) {
  const seed = KINDS[opts.kind]
  if (!seed) throw new Error(`ERR_POOL_KIND_INVALID: "${opts.kind}"`)
  const { createServer: createVendorMock } = require(`${PACKAGES[opts.kind]}/mock/server`)
  const started = createVendorMock({ host: opts.host || '127.0.0.1', port: opts.port, ...seed(opts.accounts || []) })
  return {
    ready: started,
    exit () { started.then(({ app }) => app.close()).catch(() => {}) }
  }
}

module.exports = { createServer }
