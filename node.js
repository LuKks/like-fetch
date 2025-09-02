const fetch = require('./index.js')
const create = require('./lib/create.js')
const crossFetch = require('cross-fetch')

const fetchBound = fetch.bind(null, crossFetch)

module.exports = fetchBound
module.exports.create = create.bind(null, fetchBound)
