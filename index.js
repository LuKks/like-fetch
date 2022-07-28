const cfetch = require('cross-fetch')
const retry = require('like-retry')

module.exports = fetch

function fetch (url, options = {}) {
  const opts = Object.assign({}, options)
  const retryOptions = remove(opts, 'retry')
  const timeout = remove(opts, 'timeout')
  const validateStatus = remove(opts, 'validateStatus')
  // const proxy = remove(opts, 'proxy')
  const requestType = remove(opts, 'requestType')
  const responseType = remove(opts, 'responseType')

  // const agent = handleProxyAgent(opts, proxy)
  handleRequestTypes(opts, requestType)
  handleResponseTypes(opts, responseType)

  let abortController = null
  let timeoutId = null

  const promise = new Promise(callback)

  // by now they're not null:
  promise.controller = abortController.controller
  promise.timeoutId = timeoutId

  return promise

  // + this function is not as clean as I like and there is too much going on but it's difficult due:
  // doing yielded retries, exposing properly the controller for React and wanting make it work for all use cases
  async function callback (resolve, reject) {
    try {
      abortController = handleAbortController(opts)
      timeoutId = handleTimeout(opts, timeout, abortController)
    } catch (error) {
      reject(error)
      return
    }

    for await (const backoff of retry(retryOptions)) {
      try {
        const response = await cfetch(url, { signal: abortController.signal/* , agent */, ...opts })

        handleValidateStatus(response, validateStatus)

        if (responseType === 'json' || responseType === 'text') {
          const body = await response[responseType]()
          clearTimeout(promise.timeoutId)
          resolve(body)
        } else {
          resolve(response)
        }
      } catch (error) {
        // manual abort like at React useEffect cleanup, so it must not retry
        if (error.name === 'AbortError' && !promise.controller.$timedout) {
          reject(error)
          return
        }

        // error.name => 'AbortError', error.message => 'The user aborted a request.'
        // + should not clear/abort if it's from validateStatus?

        if (backoff.left > 0) {
          clearTimeout(promise.timeoutId)
          if (promise.controller) {
            promise.controller.abort()
          }
        }

        try {
          await backoff(error)
        } catch (err) {
          reject(err)
          return
        }

        abortController = handleAbortController(opts)
        promise.controller = abortController.controller
        promise.timeoutId = handleTimeout(opts, timeout, abortController)
      }
    }
  }
}

// "https-proxy-agent" is for Node.js but obviously you won't use fetch() with the proxy option in the browser
// ie. React analyzes all the "require"s even if the code doesn't reach there, and in this case crashes due Node dependencies
// so disabling this for now
/* function handleProxyAgent (opts, proxy) {
  if (!proxy) return
  if (opts.agent) throw new Error('Conflict having both opts.proxy and opts.agent, only one allowed')

  // + add support for passing an object { host, port, auth: { username, password } }
  // + add support for socks5
  const HttpsProxyAgent = require('https-proxy-agent')
  const agent = new HttpsProxyAgent(proxy)

  return agent
} */

function handleRequestTypes (opts, requestType) {
  if (!requestType) return
  if (!opts.headers) opts.headers = {}

  if (requestType === 'json') {
    if (!opts.headers['content-type']) opts.headers['content-type'] = 'application/json'
    if (opts.body !== undefined) opts.body = JSON.stringify(opts.body)
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
  } else if (responseType === 'text') {
    return
  }

  throw new Error('responseType not supported (' + responseType + ')')
}

function handleAbortController (opts) {
  // signals can't be reused, so if the user passed in one then it won't be used again
  const controllerOpt = remove(opts, 'controller')
  const signalOpt = remove(opts, 'signal')

  if (controllerOpt) {
    if (signalOpt && controllerOpt.signal !== signalOpt) {
      throw new Error('If you pass your own controller and signal, they have to be the same (opts.controller.signal === opts.signal)')
    }
    return { controller: controllerOpt, signal: controllerOpt.signal, custom: true }
  }

  if (signalOpt) {
    if (controllerOpt && controllerOpt.signal !== signalOpt) {
      throw new Error('If you pass your own controller and signal, they have to be the same (opts.controller.signal === opts.signal)')
    }
    return { controller: controllerOpt || null, signal: signalOpt, custom: true }
  }

  const controller = new AbortController()
  return { controller, signal: controller.signal }
}

function handleTimeout (opts, timeout, abortController) {
  if (timeout === undefined || timeout === 0) return
  if (abortController.custom && !abortController.controller) throw new Error('Conflict having both opts.timeout and opts.signal, only one allowed or add opts.controller')

  const controller = abortController.controller // to keep the same variable reference

  const timeoutId = setTimeout(() => {
    controller.$timedout = true
    controller.abort()
  }, timeout)

  if (timeoutId.unref) timeoutId.unref()

  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true })

  return timeoutId
}

function handleValidateStatus (response, validateStatus) {
  if (!validateStatus) return

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

// it avoids passing non-standard args to native fetch(), like opts.timeout, validateStatus, etc
function remove (obj, key) {
  const value = obj[key]
  delete obj[key]
  return value
}
