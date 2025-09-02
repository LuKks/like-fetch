const fetch = require('./index.js')
const create = require('./lib/create.js')

const fetchBound = fetch.bind(null, globalThis.fetch)

module.exports = fetchBound
module.exports.create = create.bind(null, fetchBound)
