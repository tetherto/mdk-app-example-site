'use strict'

// WorkerRuntimeV2 host for the external `ocean-mdk-worker` contract plugin
// (git+https://github.com/OCEAN-xyz/mdk-wrk-minerpool-ocean.git).
//
// Unlike emcd/spiderpool/foundry (V1 pool service + scheduler, see
// pool-adapter.js), Ocean is contract-first: a directory of handlers loaded
// by WorkerRuntimeV2, with its own one-minute refresh loop inside the plugin.
// There is no pool service, so it serves no `ext_data`; its account data is
// read from the declared `stats` / `stats_history` telemetry channels instead.
//
// The worker hosts one logical device whose deviceId is the workerId (same
// shape as the V1 pool workers, so the site controllers can address it the
// same way). Device opts carry the Ocean/DATUM endpoints and usernames; DATUM
// credentials travel as env and are never logged by the plugin.
const path = require('path')
const debug = require('debug')('mdk:example:ocean-adapter')
const { WorkerRuntimeV2 } = require('@tetherto/mdk-worker')

const PKG_DIR = path.dirname(require.resolve('ocean-mdk-worker/package.json'))

/**
 * opts:
 *   workerId     (required) one runtime process = one workerId
 *   storeDir     (required) persistent DHT/RPC identity directory
 *   pool         (required) device opts: { apiUrl, accounts, apiRetry?, datumApiUrl? }
 *   env          plugin env, e.g. { DATUM_USER, DATUM_PASSWORD }
 *   kernelTopic  Kernel discovery topic (hex); omit to register by key
 *   allowedKeys  public keys admitted to the worker's RPC
 *   bootstrap    DHT bootstrap override for hermetic tests
 */
async function startOceanWorker (opts) {
  if (!opts || !opts.workerId) throw new Error('ERR_WORKER_ID_REQUIRED')
  if (!opts.storeDir) throw new Error('ERR_STORE_DIR_REQUIRED')
  if (!opts.pool) throw new Error('ERR_POOL_CONF_REQUIRED')

  const runtime = new WorkerRuntimeV2(PKG_DIR, {
    workerId: opts.workerId,
    kernelTopic: opts.kernelTopic || null,
    bootstrap: opts.bootstrap || null,
    storeDir: opts.storeDir,
    allowedKeys: opts.allowedKeys || [],
    allowAll: opts.allowAll === true,
    env: opts.env || {},
    devices: [{ deviceId: opts.workerId, config: { ...opts.pool } }]
  })

  await runtime.start()

  debug('ocean pool worker %s up: %d accounts', opts.workerId, (opts.pool.accounts || []).length)

  return {
    runtime,
    stop: () => runtime.stop()
  }
}

module.exports = { startOceanWorker }
