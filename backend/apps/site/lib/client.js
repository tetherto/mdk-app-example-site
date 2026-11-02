'use strict'

// The app runtime owns the Kernel client: it signs in as this app's service
// account (app:site) and hands it over as config.mdkClient. Since 0.13 Kernel
// fields are stripped from plugin config, so the app cannot build its own.
const { config } = require('@tetherto/mdk-gateway/plugin')

module.exports = config.mdkClient
