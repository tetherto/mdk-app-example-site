'use strict'

const { ready } = require('../pool')

module.exports = async () => (await ready).getMetric('balance')
