'use strict'

const test = require('brittle')
const path = require('path')
const { spawnSync } = require('child_process')

const SITE = path.join(__dirname, '..', '..', 'backend', 'site.js')

test('site.js names a missing git dependency and exits 1 instead of a raw MODULE_NOT_FOUND', (t) => {
  const hideWhatsminer = `
    const Module = require('module')
    const resolve = Module._resolveFilename
    Module._resolveFilename = function (request, ...rest) {
      if (request.startsWith('whatsminer-mdk-worker')) throw Object.assign(new Error('Cannot find module ' + request), { code: 'MODULE_NOT_FOUND' })
      return resolve.call(this, request, ...rest)
    }
    require(${JSON.stringify(SITE)})
  `
  const { status, stderr } = spawnSync(process.execPath, ['-e', hideWhatsminer], { encoding: 'utf8' })

  t.is(status, 1)
  t.ok(stderr.includes('- whatsminer-mdk-worker'), 'names the missing package')
  t.ok(stderr.includes('"npm run setup" in the project root'), 'says how to fix it')
  t.absent(stderr.includes('Require stack'), 'no raw MODULE_NOT_FOUND stack')
})
