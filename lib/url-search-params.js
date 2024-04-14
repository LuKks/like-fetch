const ENCODE_CHARS = {
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

function mapping (kv) {
  const k = encodeKey(kv[0])
  const v = encodeValue(kv[1])

  return k + '=' + v
}

function encodeKey (k) {
  return encodeURIComponent(k)
    .replace(/[!'()~]|%20|%00/g, replacer)
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')
}

function encodeValue (v) {
  return encodeURIComponent(v)
    .replace(/[!'()~]|%20|%00/g, replacer)
}

function replacer (m) {
  return ENCODE_CHARS[m]
}
