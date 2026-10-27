'use strict'

const mdkClient = require('../lib/client')
const { collectDevices, counted, json } = require('../lib/site')

module.exports = {
  schema: {},
  handler: async () => {
    const status = await mdkClient.getStatus()
    const workers = status?.workers ?? []
    const rows = collectDevices(status)
    const offline = rows.filter((r) => r.state === 'offline')
    const readyWorkers = workers.filter((w) => w.state === 'READY').length
    const byFamily = {}
    for (const r of rows) {
      byFamily[r.family] ??= { total: 0, online: 0 }
      byFamily[r.family].total++
      if (r.state === 'online') byFamily[r.family].online++
    }
    return json({
      summary: `This site has ${counted(workers.length, 'worker')} and ${counted(rows.length, 'device')}: ` +
        `${counted(rows.length - offline.length, 'device')} online, ${counted(offline.length, 'device')} offline` +
        (offline.length ? ` (${offline.map((r) => r.deviceId).join(', ')})` : '') + '.',
      totals: {
        workers: { total: workers.length, online: readyWorkers, offline: workers.length - readyWorkers },
        devices: { total: rows.length, online: rows.length - offline.length, offline: offline.length, byFamily }
      }
    })
  }
}
