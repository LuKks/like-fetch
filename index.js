const cfetch = require('cross-fetch')
const retry = require('like-retry')

module.exports = fetch

function fetch (url, options = {}) {
  const opts = Object.assign({}, options)
  const retryOptions = remove(opts, 'retry')
  const timeout = remove(opts, 'timeout')
  const validateStatus = remove(opts, 'validateStatus')
  const requestType = remove(opts, 'requestType')
  const responseType = remove(opts, 'responseType')
  const signal = remove(opts, 'signal')

  handleRequestTypes(opts, requestType)
  handleResponseTypes(opts, responseType)

  let timeoutSignal = handleTimeout(opts, timeout)

  const promise = new Promise(callback)
  promise.controller = new AbortController()
  return promise

  async function callback (resolve, reject) {
    for await (const backoff of retry(retryOptions)) {
      try {
        const signals = AbortSignal.any([signal, timeoutSignal, promise.controller.signal].filter(s => s))
        const response = await cfetch(url, { ...opts, signal: signals })

        handleValidateStatus(response, validateStatus)

        if (responseType === 'json' || responseType === 'text') {
          const body = await response[responseType]()
          resolve(body)
        } else {
          resolve(response)
        }

        return
      } catch (error) {
        // Patch TimeoutError due AbortSignal.any
        if (error.name === 'AbortError') {
          const timeoutError = getSignalError(timeoutSignal)
          if (timeoutError) error = timeoutError // eslint-disable-line no-ex-assign
        }

        if (error.response && (responseType === 'json' || responseType === 'text')) {
          try {
            error.body = await error.response[responseType]()
          } catch {}
        }

        if (error.name === 'AbortError' || error.name === 'LikeFetchError') {
          reject(error)
          return
        }

        try {
          await backoff(error)

          // Don't retry on user signals
          if (signal) signal.throwIfAborted()
          promise.controller.signal.throwIfAborted()
        } catch (err) {
          reject(err)
          return
        }

        promise.controller = new AbortController()
        timeoutSignal = handleTimeout(opts, timeout)
      }
    }
  }
}

function handleRequestTypes (opts, requestType) {
  if (!requestType) return
  if (!opts.headers) opts.headers = {}

  if (requestType === 'json') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'application/json'
    if (opts.body !== undefined) opts.body = JSON.stringify(opts.body)
    return
  }

  if (requestType === 'url') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'application/x-www-form-urlencoded'
    if (opts.body !== undefined) opts.body = new URLSearchParams(opts.body).toString()
    return
  }

  if (requestType === 'text') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'text/plain'
    return
  }

  if (requestType === 'form') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'multipart/form-data; boundary=' + opts.body.getBoundary()
    return
  }

  throw new Error('requestType not supported (' + requestType + ')')
}

function handleResponseTypes (opts, responseType) {
  if (!responseType) return
  if (!opts.headers) opts.headers = {}

  if (responseType === 'json') {
    if (!opts.headers.accept) opts.headers.accept = 'application/json'
    return
  } else if (responseType === 'file') {
    if (!opts.headers.accept) opts.headers.accept = 'application/octet-stream'
    return
  } else if (responseType === 'text') {
    return
  }

  throw new Error('responseType not supported (' + responseType + ')')
}

function handleTimeout (opts, timeout) {
  if (typeof timeout !== 'number' || timeout === 0) return null

  return AbortSignal.timeout(timeout)
}

function handleValidateStatus (response, validateStatus) {
  if (!validateStatus) return

  if (typeof validateStatus === 'number') {
    if (validateStatus !== response.status) throw customError(response.status, response)
  } else if (typeof validateStatus === 'function') {
    if (!validateStatus(response.status)) throw customError(response.status, response)
  } else if (validateStatus === 'ok') {
    if (!response.ok) throw customError(response.status, response)
  } else {
    throw new Error('validateStatus not supported (' + validateStatus + ')')
  }
}

function customError (status, response) {
  const message = 'Request failed with status code ' + status

  if (status >= 400 && status < 499) {
    return new LikeFetchError(message, 'ERR_BAD_REQUEST', response)
  }

  if (status >= 500 && status < 599) {
    return new LikeFetchError(message, 'ERR_BAD_RESPONSE', response)
  }

  return new LikeFetchError(message, undefined, response)
}

class LikeFetchError extends Error {
  constructor (msg, code, response) {
    super(msg)
    this.code = code

    this.response = response
    this.body = undefined
  }

  get name () {
    return 'LikeFetchError'
  }
}

function getSignalError (signal) {
  if (!signal || !signal.aborted) return null

  try {
    signal.throwIfAborted()
  } catch (err) {
    return err
  }

  return null
}

// It avoids passing non-standard args to native fetch() like timeout, validateStatus, etc
function remove (obj, key) {
  const value = obj[key]
  delete obj[key]
  return value
}
