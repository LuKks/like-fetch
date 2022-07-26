const cfetch = require('cross-fetch')
const retry = require('like-retry')

module.exports = fetch

async function fetch (url, options = {}) {
  const opts = Object.assign({}, options)
  const retryOptions = remove(opts, 'retry')
  // if (!retryOptions) return request(url, opts)

  for await (const backoff of retry(retryOptions)) {
    const promise = request(url, opts)
    try {
      return await promise
    } catch (error) {
      // + should clear if there is backoffs left
      // clearTimeout(promise.timeoutId)
      // promise.controller.abort()
      await backoff(error)
    }
  }
}

function request (url, options = {}) {
  const opts = Object.assign({}, options)
  const timeout = remove(opts, 'timeout')
  const validateStatus = remove(opts, 'validateStatus')
  const proxy = remove(opts, 'proxy')
  const requestType = remove(opts, 'requestType')
  const responseType = remove(opts, 'responseType')

  let agent
  if (proxy) {
    // + add support for passing an object { host, port, auth: { username, password } }
    // + add support for socks5
    const HttpsProxyAgent = require('https-proxy-agent')
    agent = new HttpsProxyAgent(proxy)
  }

  if (!opts.headers) opts.headers = {}

  if (requestType === 'json') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'application/json'
    if (opts.body !== undefined) opts.body = JSON.stringify(opts.body)
  }

  if (responseType === 'json') {
    if (!opts.headers.accept) opts.headers.accept = 'application/json'
  }

  const controller = new AbortController()

  let timeoutId
  if (timeout !== undefined && timeout !== 0) {
    timeoutId = setTimeout(() => controller.abort(), timeout)
    if (timeoutId.unref) timeoutId.unref()
    controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true })
  }

  // + this promise + controller allows easy usage in React (useEffect, etc)
  // + should move retry inside request()->callback(), or do something to expose this promise directly
  const promise = new Promise(callback)
  promise.controller = controller
  promise.timeoutId = timeoutId
  return promise

  async function callback (resolve, reject) {
    try {
      const response = await cfetch(url, {
        signal: controller.signal,
        agent,
        ...opts
      })

      if (validateStatus) {
        // + should throw custom error like AxiosError

        if (typeof validateStatus === 'number') {
          if (validateStatus !== response.status) throw response
        } else if (typeof validateStatus === 'function') {
          if (!validateStatus(response.status)) throw response
        } else if (validateStatus === 'ok') {
          if (!response.ok) throw response
        } else {
          throw new Error('validateStatus not supported (' + validateStatus + ')')
        }
      }

      if (responseType === 'json') {
        const body = await response.json()
        clearTimeout(timeoutId)
        resolve(body)
      } else if (responseType === 'text') {
        const body = await response.text()
        clearTimeout(timeoutId)
        resolve(body)
      } else {
        resolve(response)
      }
    } catch (error) {
      // error.name => 'AbortError', error.message => 'The user aborted a request.'

      // + should not clear/abort if it's from validateStatus
      clearTimeout(timeoutId)
      // controller.abort()

      reject(error)
    }
  }
}

// it avoids passing non-standard args to native fetch(), like opts.timeout, validateStatus, etc
function remove (obj, key) {
  const value = obj[key]
  delete obj[key]
  return value
}
