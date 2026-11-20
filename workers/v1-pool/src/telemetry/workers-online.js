'use strict'

const { ready } = require('../pool')

module.exports = async () => (await ready).getMetric('active_workers_count')
