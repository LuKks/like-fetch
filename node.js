const fetch = require('./index.js')
const crossFetch = require('cross-fetch')

module.exports = fetch.bind(null, crossFetch)
