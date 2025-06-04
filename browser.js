const fetch = require('./index.js')

module.exports = fetch.bind(null, globalThis.fetch)
