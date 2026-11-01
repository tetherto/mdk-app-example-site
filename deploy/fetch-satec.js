'use strict'

// Fetches MDK's SATEC power-meter worker (@tetherto/mdk-worker-satec) into
// vendor/mdk-satec/ (gitignored).
//
// It can't be a package.json dependency: it isn't published to npm, npm can't
// install one folder of a git repo, and the worker requires files outside its
// own folder by relative path (the mock base classes in backend/workers/mock,
// and backend/core). So this takes those paths, plus the monorepo's root
// package.json and lockfile to install them, from the github.com/tetherto/mdk
// release tag matching the installed @tetherto/mdk-core, and installs the
// worker's workspace there. Same approach as mdk-app-reporting-tool's setup.
//
// Re-fetches only when the vendored copy is missing or from another MDK
// version; pass --force to fetch again anyway.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const SATEC_ROOT = path.join(__dirname, '..', 'vendor', 'mdk-satec')
const SATEC_DIR = path.join(SATEC_ROOT, 'backend', 'workers', 'power-meter', 'satec')
const VERSION_FILE = path.join(SATEC_ROOT, '.mdk-version')

const SATEC_PATHS = [
  'package.json',
  'package-lock.json',
  'backend/core',
  'backend/workers/mock',
  'backend/workers/power-meter/satec'
]

const mdkVersion = () => require('@tetherto/mdk-core/package.json').version

const isInstalled = (version) =>
  fs.existsSync(path.join(SATEC_ROOT, 'node_modules')) &&
  fs.existsSync(VERSION_FILE) &&
  fs.readFileSync(VERSION_FILE, 'utf8').trim() === version

const fetchSatec = async ({ force = false, log = console.log } = {}) => {
  const version = mdkVersion()
  if (!force && isInstalled(version)) {
    log('skipped vendor/mdk-satec (MDK %s already fetched)', version)
    return SATEC_DIR
  }

  const tag = `v${version}`
  log('fetching the SATEC worker from tetherto/mdk %s…', tag)
  const res = await fetch(`https://codeload.github.com/tetherto/mdk/tar.gz/refs/tags/${tag}`)
  if (!res.ok) throw new Error(`ERR_SATEC_FETCH_FAILED: tetherto/mdk ${tag}: HTTP ${res.status}`)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-satec-'))
  try {
    const archive = path.join(tmp, 'mdk.tar.gz')
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
    fs.rmSync(SATEC_ROOT, { recursive: true, force: true })
    fs.mkdirSync(SATEC_ROOT, { recursive: true })
    const top = `mdk-${version}`
    execFileSync('tar', ['-xzf', archive, '-C', SATEC_ROOT, '--strip-components', '1', ...SATEC_PATHS.map((p) => `${top}/${p}`)])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  // With dev dependencies: the SATEC mock's Modbus server (modbus-stream) is one.
  // NPM may wrap npm (e.g. NPM="sfw npm").
  const [npm, ...npmPre] = (process.env.NPM || 'npm').split(' ')
  execFileSync(npm, [
    ...npmPre, 'install',
    '-w', '@tetherto/mdk-worker-satec',
    '-w', '@tetherto/mdk-core',
    '-w', '@tetherto/mdk-worker',
    '--ignore-scripts', '--no-audit', '--no-fund'
  ], { cwd: SATEC_ROOT, stdio: 'inherit' })

  // Written last: a failed run leaves no record, so the next one retries.
  fs.writeFileSync(VERSION_FILE, `${version}\n`)
  log('installed vendor/mdk-satec (MDK %s)', version)
  return SATEC_DIR
}

if (require.main === module) {
  fetchSatec({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}

module.exports = { fetchSatec, SATEC_ROOT, SATEC_DIR }
