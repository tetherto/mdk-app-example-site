'use strict'

const { loadSite, snapStats, snapConfig, pullPoolStats } = require('./utils')

const containerId = (thg) => {
  return (thg.info && thg.info.container) || thg.id || thg.code
}

// Miner statuses that mean the miner is up (the UI counts the same ones as online).
const HEALTHY_MINER = new Set(['online', 'mining', 'active', 'normal', 'running'])

// A container with no container worker behind it (this site runs none): its
// figures come from the miners in it. Power is their summed draw; status is
// online while any of them hashes, offline when none answers, else error.
// Nothing measures its temperatures, so they stay null rather than 0 °C.
const containerFromMiners = (id, miners, inletTempC) => {
  const healthy = miners.filter((m) => HEALTHY_MINER.has(String(m.status).toLowerCase())).length
  const offline = miners.filter((m) => String(m.status).toLowerCase() === 'offline').length
  return {
    deviceId: id,
    id,
    code: id,
    operatingStatus: healthy > 0 ? 'online' : (offline === miners.length ? 'offline' : 'error'),
    powerW: miners.reduce((sum, m) => sum + (m.powerW || 0), 0),
    ambientTempC: null,
    inletTempC: inletTempC ?? null,
    minerCount: miners.length
  }
}

const phase1CurrentA = (powerSpecific) => {
  if (!powerSpecific) return 0
  if (powerSpecific.i1_a != null) return Number(powerSpecific.i1_a) || 0
  const iv = powerSpecific.instantaneous_values
  if (!iv) return 0
  if (iv.current_i1_a != null) return Number(iv.current_i1_a) || 0
  if (iv.current_a_a != null) return Number(iv.current_a_a) || 0
  return 0
}

const aggregateSiteMeters = (siteMeters) => {
  let powerW = 0
  let currentA = 0
  let tensionSum = 0
  let tensionCount = 0
  for (const thg of siteMeters) {
    const s = snapStats(thg)
    powerW += Number(s.power_w) || 0
    currentA += phase1CurrentA(s.powermeter_specific)
    const tension = Number(s.tension_v) || 0
    if (tension > 0) {
      tensionSum += tension
      tensionCount++
    }
  }
  return {
    powerW,
    currentA,
    tensionV: tensionCount > 0 ? tensionSum / tensionCount : 0
  }
}

const powermeterLabel = (thg) => {
  const type = thg.type || ''
  if (type.includes('abb')) return 'ABB B23'
  if (type.includes('satec')) return 'SATEC PM180'
  if (type.includes('schneider')) return 'Schneider PM5340'
  return thg.code || thg.id
}

const mapPowermeter = (thg) => {
  const s = snapStats(thg)
  return {
    deviceId: thg.id,
    code: thg.code,
    type: thg.type,
    label: powermeterLabel(thg),
    powerW: Number(s.power_w) || 0,
    tensionV: Number(s.tension_v) || 0,
    currentA: phase1CurrentA(s.powermeter_specific)
  }
}

const sensorLabel = (thg) => {
  const type = thg.type || ''
  if (type.includes('seneca')) return 'Seneca'
  return thg.code || thg.id
}

const mapSensor = (thg) => {
  const s = snapStats(thg)
  return {
    deviceId: thg.id,
    container: (thg.info && thg.info.container) || '',
    label: sensorLabel(thg),
    tempC: Number(s.temp_c) || 0,
    status: s.status || 'unknown'
  }
}

const mapPool = async (pool, mdkClient) => {
  const stats = await pullPoolStats(mdkClient, pool.deviceId)
  const p = stats[0]
  if (!p) return null
  return {
    deviceId: pool.deviceId,
    name: p.username || pool.workerId,
    poolType: p.poolType || pool.workerId,
    status: 'online',
    hashrate: p.hashrate || 0,
    hashrate24h: p.hashrate_24h || 0,
    workersOnline: p.active_workers_count != null ? p.active_workers_count : (p.worker_count || 0),
    balanceBtc: p.balance || 0,
    revenue24hBtc: p.revenue_24h || 0
  }
}

// Live site snapshot — all containers with linked miners, site power from the
// powermeter, sensors, and pools — all sourced via mdkClient over the RPC listener.
//
// `ctx` is a test-only seam — see command.js.
module.exports = async (req, ctx) => {
  const mdkClient = ctx === undefined ? require('../lib/client') : ctx.mdkClient
  const { byFamily, pools } = await loadSite(mdkClient, { status: true })

  const minerThings = byFamily.miner || []
  const containerThings = byFamily.container || []
  const siteMeters = (byFamily['power-meter'] || []).filter((t) => t.info && t.info.pos === 'site')
  const sensorThings = byFamily.sensor || []

  const sensors = sensorThings.map(mapSensor).sort((a, b) => a.container.localeCompare(b.container))
  const sensorByContainer = new Map(sensors.map((s) => [s.container, s.tempC]))

  const miners = minerThings.map((thg) => {
    const s = snapStats(thg)
    const c = snapConfig(thg)
    const hr = s.hashrate_mhs || {}
    const temp = s.temperature_c || {}
    return {
      deviceId: thg.id,
      code: thg.code,
      type: thg.type || '',
      workerId: thg.workerId || '',
      container: containerId(thg),
      pos: thg.info && thg.info.pos,
      status: s.status || 'unknown',
      powerMode: c.power_mode || null,
      hashrateMhs: hr.t_5m || hr.avg || 0,
      powerW: s.power_w || 0,
      temperature: temp.avg || 0
    }
  })

  const totals = miners.reduce((acc, m) => {
    acc.hashrateMhs += m.hashrateMhs
    acc.powerW += m.powerW
    if (m.status === 'mining' || m.status === 'sleeping') acc.onlineCount++
    return acc
  }, { hashrateMhs: 0, powerW: 0, onlineCount: 0 })

  const containerById = new Map()
  for (const thg of containerThings) {
    const id = containerId(thg)
    const s = snapStats(thg)
    containerById.set(id, {
      deviceId: thg.id,
      id,
      code: thg.code,
      operatingStatus: s.status || 'unknown',
      powerW: s.power_w || 0,
      ambientTempC: s.ambient_temp_c ?? null,
      inletTempC: sensorByContainer.get(id) ?? null,
      minerCount: 0
    })
  }

  // Every container a miner names appears, even with no container worker
  // behind it: then its figures are derived from its miners.
  for (const m of miners) {
    if (!m.container || containerById.has(m.container)) continue
    const inContainer = miners.filter((x) => x.container === m.container)
    containerById.set(m.container, containerFromMiners(m.container, inContainer, sensorByContainer.get(m.container)))
  }

  const containers = [...containerById.values()]
    .map((c) => ({
      ...c,
      minerCount: miners.filter((m) => m.container === c.id).length
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const sitePower = aggregateSiteMeters(siteMeters)
  const powermeters = siteMeters.map(mapPowermeter).sort((a, b) => a.label.localeCompare(b.label))

  const poolData = (await Promise.all(pools.map((p) => mapPool(p, mdkClient))))
    .filter(Boolean)
    .sort((a, b) => a.poolType.localeCompare(b.poolType))

  return {
    ts: Date.now(),
    containers,
    site: {
      powerW: sitePower.powerW,
      tensionV: sitePower.tensionV,
      currentA: sitePower.currentA
    },
    powermeters,
    pools: poolData,
    sensors,
    miners,
    totals: {
      hashrateMhs: totals.hashrateMhs,
      powerW: totals.powerW,
      minerCount: miners.length,
      onlineCount: totals.onlineCount
    }
  }
}
