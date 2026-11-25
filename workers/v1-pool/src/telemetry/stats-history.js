'use strict'

const { ready } = require('../pool')

module.exports = async (params = {}) => (await ready).getWrkExtData({ query: { ...params, key: 'stats-history' } })
