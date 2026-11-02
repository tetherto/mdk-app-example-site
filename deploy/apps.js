'use strict'

// The gateway apps this site runs, from config/site.deploy.json gateway.pluginDirs.
// Each runs in its own app runtime process (PM2 role `app-<name>`) and gets a
// Kernel service account `app:<name>`. An entry is either:
//
//   "backend/apps/site"   a local app directory: named after its basename and
//                         mounted at `/` (the site UI calls root paths)
//
//   { "name": "demo", "package": "@tetherto/mdk-app-demo", "mount": "/", "config": {...}, "mcp": false }
//                         an installed app package (or `"dir"` for a local
//                         directory). `mount` defaults to the Gateway's
//                         `/apps/<name>`; `config` is handed to the app as its
//                         operator config (e.g. the agent's `config.agent`);
//                         `mcp: false` keeps its routes off the MCP server's tool list.
//
// Kept free of backend requires so start.js can read the app list without
// booting anything.

const path = require('path')

const APP_NAME = /^[a-z][a-z0-9-]*$/

const resolveApps = (pluginDirs = [], baseDir = path.join(__dirname, '..')) => {
  const seen = new Set()
  return pluginDirs.map((entry) => {
    const spec = typeof entry === 'string' ? { dir: entry, mount: '/' } : { ...entry }
    let appDir
    if (spec.package) {
      appDir = path.dirname(require.resolve(`${spec.package}/package.json`, { paths: [baseDir] }))
    } else if (spec.dir) {
      appDir = path.resolve(baseDir, spec.dir)
    } else {
      throw new Error(`ERR_APP_SOURCE_REQUIRED: gateway.pluginDirs entry ${JSON.stringify(entry)} needs "package" or "dir"`)
    }
    const name = spec.name || path.basename(spec.dir || appDir)
    if (!APP_NAME.test(name)) throw new Error(`ERR_APP_NAME_INVALID: "${name}" must be lowercase letters, digits and dashes`)
    if (seen.has(name)) throw new Error(`ERR_APP_NAME_DUPLICATE: "${name}"`)
    seen.add(name)
    return {
      name,
      appDir,
      mount: spec.mount,
      config: spec.config || {},
      mcp: spec.mcp !== false
    }
  })
}

// Names only, for start.js: no package resolution, so a missing package
// surfaces in the app's own process rather than at `npm start`.
const appNames = (pluginDirs = []) => pluginDirs.map((entry) =>
  typeof entry === 'string' ? path.basename(entry) : (entry.name || path.basename(entry.dir || entry.package || ''))
)

module.exports = { resolveApps, appNames }
