const test = require('brittle')
const fetch = require('./')
const net = require('net')
const http = require('http')

// TODO: Should use local servers instead of relaying in remote ones

test('basic', async function (t) {
  const response = await fetch('https://checkip.amazonaws.com')
  const body = await response.text()

  const ip = body.trim()
  t.ok(net.isIP(ip))
})

test('timeout response', async function (t) {
  try {
    await fetch('https://checkip.amazonaws.com', { timeout: 1 })
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
  }
})

test.skip('timeout body', async function (t) {
  try {
    const response = await fetch('https://http.cat/401', { timeout: 3000 })
    await sleep(3000)
    await response.blob()
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
  }
})

test('retry', async function (t) {
  const started = Date.now()

  try {
    const retry = { max: 3, delay: 1000, strategy: 'linear' }
    await fetch('https://checkip.amazonaws.com', { timeout: 1, retry })
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
  }

  t.ok(isAround(Date.now() - started, 6000))
})

test('status validation', async function (t) {
  try {
    await fetch('https://checkip.amazonaws.com', { validateStatus: 404 })
    t.fail('Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }

  try {
    await fetch('https://api.agify.io/not-found', { validateStatus: 'ok' })
    t.fail('Should have given error')
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
    t.fail('Should not have given error')
  }

  try {
    const validateStatus = status => status !== 200
    await fetch('https://checkip.amazonaws.com', { validateStatus })
    t.fail('Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }
})

test('request types', async function (t) {
  const body = { userId: 5, title: 'hello', body: 'world' }
  const response = await fetch('https://jsonplaceholder.typicode.com/posts', { method: 'POST', requestType: 'json', body })
  const data = await response.json()
  t.is(data.title, 'hello')
})

test('response types', async function (t) {
  const port = await createServer(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: 'lucas' }))
  })

  const body1 = await fetch('http://127.0.0.1:' + port, { responseType: 'json' })
  t.is(typeof body1, 'object')
  t.alike(body1, { name: 'lucas' })

  const body2 = await fetch('http://127.0.0.1:' + port, { responseType: 'text' })
  t.is(typeof body2, 'string')
  t.ok(body2.indexOf('"name":"lucas"') > -1)
})

test('controller manual abort should ignore retry', async function (t) {
  const port = await createServer(t, (req, res) => { res.writeHead(200).end() })

  const started = Date.now()

  try {
    const promise = fetch('http://127.0.0.1:' + port, { retry: { max: 3, delay: 1000 } })
    promise.controller.abort()
    await promise
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }

  t.ok(isAround(Date.now() - started, 0))
})

test('controller changes at every retry', async function (t) {
  const started = Date.now()

  // with timeout at 1 (one) we make it fail and just one retry is enough to change the "promise.controller"
  const promise = fetch('https://checkip.amazonaws.com', { timeout: 1, retry: { max: 1 } })
  const controller = promise.controller

  try {
    await promise
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
    t.ok(controller !== null)
    t.ok(promise.controller !== controller) // controller changed!
  }

  t.ok(isAround(Date.now() - started, 0))
})

test('timeout + custom signal with controller should be ok', async function (t) {
  const port = await createServer(t, (req, res) => { res.writeHead(200).end() })

  const started = Date.now()

  const controller = new AbortController()
  const promise = fetch('http://127.0.0.1:' + port, { timeout: 1, retry: { max: 1 }, signal: controller.signal })

  let previousController = null
  try {
    previousController = promise.controller

    await promise
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
    t.ok(promise.controller !== previousController)
  }

  t.ok(isAround(Date.now() - started, 0))
})

test('timeout + custom controller without passing signal should be ok', async function (t) {
  const port = await createServer(t, (req, res) => { res.writeHead(200).end() })

  const started = Date.now()

  const promise = fetch('http://127.0.0.1:' + port, { timeout: 1, retry: { max: 1 } })

  let previousController = null
  try {
    previousController = promise.controller

    await promise
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
    t.ok(promise.controller !== previousController)
  }

  t.ok(isAround(Date.now() - started, 0))
})

test('could not send the request', async function (t) {
  try {
    await fetch('http://127.0.0.1:123')
    t.fail('Should have given error')
  } catch (err) {
    t.is(err.name, 'FetchError') // Native Fetch error
    t.is(err.code, 'ECONNREFUSED')
  }
})

test('bad request', async function (t) {
  const port = await createServer(t, (req, res) => { res.writeHead(400).end('Hello') })

  try {
    await fetch('http://127.0.0.1:' + port, { validateStatus: 'ok' })
    t.fail('Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_REQUEST')
    t.is(await err.response.text(), 'Hello')
  }
})

test('bad response', async function (t) {
  const port = await createServer(t, (req, res) => res.writeHead(500).end('Hello'))

  try {
    await fetch('http://127.0.0.1:' + port, { validateStatus: 'ok' })
    t.fail('Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_RESPONSE')
    t.is(await err.response.text(), 'Hello')
  }
})

test('response type works when validate fails', async function (t) {
  const port = await createServer(t, (req, res) => res.writeHead(400).end(JSON.stringify({ hello: 'world' })))

  try {
    await fetch('http://127.0.0.1:' + port, { responseType: 'json', validateStatus: 'ok' })
    t.fail('Should have given error')
  } catch (err) {
    if (!err.response) throw err

    t.is(err.name, 'LikeFetchError')
    t.is(err.code, 'ERR_BAD_REQUEST')
    t.alike(err.body, { hello: 'world' })
  }
})

test('user controller on the edge of a failing response', async function (t) {
  const port = await createServer(t, (req, res) => res.writeHead(400).end(JSON.stringify({ hello: 'world' })))

  try {
    const req = fetch('http://127.0.0.1:' + port, {
      retry: { max: 9999999 },
      validateStatus: status => {
        req.controller.abort()
        throw new Error('Failed')
      }
    })

    await req

    t.fail('Should have given error')
  } catch (err) {
    t.is(err.name, 'AbortError')
  }
})

function isAround (delay, real, precision = 150) {
  const diff = Math.abs(delay - real)
  return diff <= precision
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createServer (t, onrequest) {
  const server = http.createServer(onrequest)

  t.teardown(() => new Promise(resolve => server.close(resolve)))

  await listen(server, 0)

  return server.address().port
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
