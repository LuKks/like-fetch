module.exports = function create (fetch, defaultUrl, defaultOptions = {}) {
  if (defaultUrl && typeof defaultUrl === 'object') {
    defaultOptions = defaultUrl
    defaultUrl = null
  }

  return function api (url, options = {}) {
    const uri = defaultUrl ? defaultUrl + url : url
    const opts = Object.assign({}, defaultOptions, options)

    return fetch(uri, opts)
  }
}
