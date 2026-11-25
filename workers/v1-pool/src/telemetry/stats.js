'use strict'

const { ready } = require('../pool')

module.exports = async () => (await ready).getWrkExtData({ query: { key: 'stats' } })
