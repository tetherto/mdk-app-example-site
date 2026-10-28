'use strict'

// Seeds local config from the committed *.example files; never overwrites.

const fs = require('fs')
const path = require('path')

const configDir = path.join(__dirname, '..', 'config')
const SUFFIX = '.example'

for (const file of fs.readdirSync(configDir).sort()) {
  if (!file.endsWith(SUFFIX)) continue

  const target = file.slice(0, -SUFFIX.length)
  const targetPath = path.join(configDir, target)

  if (fs.existsSync(targetPath)) {
    console.log('skipped config/%s (already exists)', target)
    continue
  }

  fs.copyFileSync(path.join(configDir, file), targetPath)
  console.log('created config/%s (from %s)', target, file)
}
