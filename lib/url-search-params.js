const QUERY_ENCODE_CHARS = {
  '!': '%21',
  "'": '%27',
  '(': '%28',
  ')': '%29',
  '~': '%7E',
  '%20': '+',
  '%00': '\x00'
}

module.exports = class FetchURLSearchParams {
  constructor () {
    this._params = []
  }

  get size () {
    return this._params.length
  }

  append (key, value) {
    this._params.push([key, value])
  }

  toString () {
    return this._params.map(mapping, '').join('&')
  }
}

function mapping ([key, value]) {
  const k = encodeQueryKey(key)
  const v = encodeQueryValue(value)

  return k + '=' + v
}

function encodeQueryKey (k) {
  return encodeURIComponent(k)
    .replace(/[!'()~]|%20|%00/g, queryEncodeReplacer)
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')
}

function encodeQueryValue (v) {
  return encodeURIComponent(v)
    .replace(/[!'()~]|%20|%00/g, queryEncodeReplacer)
}

function queryEncodeReplacer (m) {
  return QUERY_ENCODE_CHARS[m]
}
