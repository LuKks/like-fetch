const tape = require('tape')
const fetch = require('./')
const net = require('net')
const http = require('http')

// TODO: Use brittle for testing
// TODO: Should use local servers instead of relaying in remote ones

tape('basic', async function (t) {
  const response = await fetch('https://checkip.amazonaws.com')
  const body = await response.text()

  const ip = body.trim()
  t.ok(net.isIP(ip))
})

tape('timeout response', async function (t) {
  try {
    await fetch('https://checkip.amazonaws.com', { timeout: 1 })
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }
})

tape.skip('timeout body', async function (t) {
  try {
    const response = await fetch('https://http.cat/401', { timeout: 3000 })
    await sleep(3000)
    await response.blob()
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }
})

tape('retry', async function (t) {
  const started = Date.now()

  try {
    const retry = { max: 3, delay: 1000, strategy: 'linear' }
    await fetch('https://checkip.amazonaws.com', { timeout: 1, retry })
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }

  t.ok(isAround(Date.now() - started, 6000))
})

tape('status validation', async function (t) {
  try {
    await fetch('https://checkip.amazonaws.com', { validateStatus: 404 })
    t.ok(false, 'Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }

  try {
    await fetch('https://api.agify.io/not-found', { validateStatus: 'ok' })
    t.ok(false, 'Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }

  try {
    const validateStatus = status => status === 200
    const response = await fetch('https://checkip.amazonaws.com', { validateStatus })
    const body = await response.text()
    const ip = body.trim()
    t.ok(net.isIP(ip))
  } catch (error) {
    t.ok(false, 'Should not have given error')
  }

  try {
    const validateStatus = status => status !== 200
    await fetch('https://checkip.amazonaws.com', { validateStatus })
    t.ok(false, 'Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }
})

tape('request types', async function (t) {
  const body = { userId: 5, title: 'hello', body: 'world' }
  const response = await fetch('https://jsonplaceholder.typicode.com/posts', { method: 'POST', requestType: 'json', body })
  const data = await response.json()
  t.is(data.title, 'hello')
})

tape('response types', async function (t) {
  const body1 = await fetch('https://api.agify.io/?name=lucas', { responseType: 'json' })
  t.is(typeof body1, 'object')
  t.is(body1.name, 'lucas')

  const body2 = await fetch('https://api.agify.io/?name=lucas', { responseType: 'text' })
  t.is(typeof body2, 'string')
  t.ok(body2.indexOf('"name":"lucas"') > -1)
})

tape('controller manual abort should ignore retry', async function (t) {
  const started = Date.now()

  try {
    const promise = fetch('https://checkip.amazonaws.com', { retry: { max: 3, delay: 1000 } })
    promise.controller.abort()
    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }

  t.ok(isAround(Date.now() - started, 0))
})

tape('controller changes at every retry', async function (t) {
  const started = Date.now()

  // with timeout at 1 (one) we make it fail and just one retry is enough to change the "promise.controller"
  const promise = fetch('https://checkip.amazonaws.com', { timeout: 1, retry: { max: 1 } })
  const controller = promise.controller

  try {
    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
    t.ok(controller !== null)
    t.ok(promise.controller !== controller) // controller changed!
  }

  t.ok(isAround(Date.now() - started, 0))
})

tape('timeout + custom signal with controller should be ok', async function (t) {
  const started = Date.now()

  const controller = new AbortController()
  const promise = fetch('https://checkip.amazonaws.com', { timeout: 1, retry: { max: 1 }, signal: controller.signal })

  let previousController = null
  try {
    previousController = promise.controller

    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
    t.ok(promise.controller !== previousController)
  }

  t.ok(isAround(Date.now() - started, 0))
})

tape('timeout + custom controller without passing signal should be ok', async function (t) {
  const started = Date.now()

  const promise = fetch('https://checkip.amazonaws.com', { timeout: 1, retry: { max: 1 } })

  let previousController = null
  try {
    previousController = promise.controller

    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
    t.ok(promise.controller !== previousController)
  }

  t.ok(isAround(Date.now() - started, 0))
})

tape('could not send the request', async function (t) {
  try {
    await fetch('http://127.0.0.1:123')
    t.ok(false, 'Should have given error')
  } catch (err) {
    t.notOk(err.response)
    t.is(err.name, 'FetchError') // Native Fetch error
    t.is(err.code, 'ECONNREFUSED')
  }
})

tape('bad request', async function (t) {
  const close = await createServer(3000, (req, res) => { res.writeHead(400).end('Hello') })

  try {
    await fetch('http://127.0.0.1:3000', { validateStatus: 'ok' })
    t.ok(false, 'Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_REQUEST')
    t.is(await err.response.text(), 'Hello')
  }

  await close()
})

tape('bad response', async function (t) {
  const close = await createServer(3000, (req, res) => res.writeHead(500).end('Hello'))

  try {
    await fetch('http://127.0.0.1:3000', { validateStatus: 'ok' })
    t.ok(false, 'Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_RESPONSE')
    t.is(await err.response.text(), 'Hello')
  }

  await close()
})

tape('response type works when validate fails', async function (t) {
  const close = await createServer(3000, (req, res) => res.writeHead(400).end(JSON.stringify({ hello: 'world' })))

  try {
    await fetch('http://127.0.0.1:3000', { responseType: 'json', validateStatus: 'ok' })
    t.ok(false, 'Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_REQUEST')
    t.deepEqual(err.data, { hello: 'world' })
  }

  await close()
})

function isAround (delay, real, precision = 150) {
  const diff = Math.abs(delay - real)
  return diff <= precision
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createServer (port, onrequest) {
  const server = http.createServer(onrequest)
  const onclose = new Promise(resolve => server.once('close', resolve))

  await listen(server, port)

  return async function () {
    server.close()
    await onclose
    // TODO: Unsure why this is required, maybe due tape?
    await new Promise(resolve => setImmediate(resolve))
  }
}

function listen (server, port, address) {
  return new Promise((resolve, reject) => {
    server.on('listening', done)
    server.on('error', done)

    server.listen(port)

    function done (err) {
      server.off('listening', done)
      server.off('error', done)

      if (err) reject(err)
      else resolve()
    }
  })
}
