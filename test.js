const test = require('brittle')
const fetch = require('./node.js')
const fetch2 = require('./browser.js')
const http = require('http')
const express = require('express')

const NODE_MAJOR_VERSION = Number(process.versions.node.split('.')[0])

test('basic', async function (t) {
  const port = await createServer(t, (req, res) => { res.writeHead(200).end('hello') })

  const response = await fetch('http://127.0.0.1:' + port)
  const body = await response.text()
  t.is(body, 'hello')
})

test('create', async function (t) {
  t.plan(2)

  const port = await createServer(t, (req, res) => {
    t.is(req.headers['x-custom'], 'abc')

    res.writeHead(200).end(JSON.stringify({ msg: 'hello' }))
  })

  const api = fetch.create('http://127.0.0.1:' + port, {
    headers: {
      'x-custom': 'abc'
    },
    requestType: 'json',
    responseType: 'json'
  })

  const data = await api('/')

  t.alike(data, { msg: 'hello' })
})

test('timeout response', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
  const port = await createServer(t, (req, res) => {
    const id = setTimeout(() => {}, 30000)
    res.on('close', () => clearTimeout(id))
  })

  try {
    await fetch('http://127.0.0.1:' + port, { timeout: 1 })
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
  }
})

test('retry', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
  const port = await createServer(t, (req, res) => {
    const id = setTimeout(() => {}, 30000)
    res.on('close', () => clearTimeout(id))
  })

  const started = Date.now()

  try {
    const retry = { max: 3, delay: 1000, strategy: 'linear' }
    await fetch('http://127.0.0.1:' + port, { timeout: 1, retry })
    t.fail('Should have given error')
  } catch (error) {
    t.is(error.name, 'TimeoutError')
  }

  t.ok(isAround(Date.now() - started, 6000))
})

test('status validation', async function (t) {
  try {
    const port = await createServer(t, (req, res) => res.writeHead(200).end())

    await fetch('http://127.0.0.1:' + port, { validateStatus: 404 })
    t.fail('Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }

  try {
    const port = await createServer(t, (req, res) => res.writeHead(404).end())

    await fetch('http://127.0.0.1:' + port, { validateStatus: 'ok' })
    t.fail('Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }

  try {
    const port = await createServer(t, (req, res) => res.writeHead(200).end())

    const validateStatus = status => status === 200
    await fetch('http://127.0.0.1:' + port, { validateStatus })
  } catch (error) {
    t.fail('Should not have given error')
  }

  try {
    const port = await createServer(t, (req, res) => res.writeHead(200).end())

    const validateStatus = status => status !== 200
    await fetch('http://127.0.0.1:' + port, { validateStatus })
    t.fail('Should have given error')
  } catch (err) {
    t.ok(err.response)
    t.is(err.name, 'LikeFetchError')
  }
})

test('request types', async function (t) {
  const port = await createServer(t, (req, res) => {
    let received = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { received += chunk })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(received)
    })
  })

  const body = { userId: 5, title: 'hello', body: 'world' }
  const response = await fetch('http://127.0.0.1:' + port, { method: 'POST', requestType: 'json', body })
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

test('query string and object', async function (t) {
  t.plan(2)

  const app = express()

  const query = {
    undef: undefined,
    nool: null,
    buf: Buffer.from('hi'),
    empty: '',
    msg: 'Hello World!',
    zero: 0,
    num: 1337,
    flag: true,
    debug: false,
    something: 'a',
    '>~some, + (thing) : el$e!': '>~some, + (thing) : el$e!',
    items: ['a,b', 'c', null, undefined, 'd']
  }

  app.get('/', function (req, res) {
    // Note: Don't depend on this raw query string as it could change in the future due encodings, arrays, etc
    // Any flexible backend will get you the expected object
    t.is(req.url, '/?something=b%21&else=a%25b%25c&items=x1%2Cx2&items=x3&buf=hi&empty=&msg=Hello+World%21&zero=0&num=1337&flag=true&debug=false&something=a&%3E%7Esome%2C+%2B+%28thing%29+%3A+el%24e%21=%3E%7Esome%2C+%2B+%28thing%29+%3A+el%24e%21&items[]=a%2Cb&items[]=c&items[]=d')

    t.alike(req.query, {
      something: ['b!', 'a'],
      '>~some, + (thing) : el$e!': '>~some, + (thing) : el$e!',
      else: 'a%b%c',
      items: ['x1,x2', 'x3', 'a,b', 'c', 'd'],
      buf: 'hi',
      empty: '',
      msg: 'Hello World!',
      zero: '0',
      num: '1337',
      flag: 'true',
      debug: 'false'
    })

    res.sendStatus(200)
  })

  const port = await createServer(t, app)

  const search = '?something=b!&else=a%b%c&items=x1,x2&items=x3#abc'

  await fetch('http://127.0.0.1:' + port + '/' + search, { query })
})

test('query object', async function (t) {
  t.plan(2)

  const app = express()

  const query = {
    undef: undefined,
    nool: null,
    buf: Buffer.from('hi'),
    empty: '',
    msg: 'Hello World!',
    zero: 0,
    num: 1337,
    flag: true,
    debug: false,
    something: 'a',
    '>~some, + (thing) : el$e!': '>~some, + (thing) : el$e!',
    items: ['a,b', 'c', null, undefined, 'd']
  }

  app.get('/', function (req, res) {
    // Note: Don't depend on this raw query string as it could change in the future
    t.is(req.url, '/?buf=hi&empty=&msg=Hello+World%21&zero=0&num=1337&flag=true&debug=false&something=a&%3E%7Esome%2C+%2B+%28thing%29+%3A+el%24e%21=%3E%7Esome%2C+%2B+%28thing%29+%3A+el%24e%21&items[]=a%2Cb&items[]=c&items[]=d')

    t.alike(req.query, {
      something: 'a',
      '>~some, + (thing) : el$e!': '>~some, + (thing) : el$e!',
      items: ['a,b', 'c', 'd'],
      buf: 'hi',
      empty: '',
      msg: 'Hello World!',
      zero: '0',
      num: '1337',
      flag: 'true',
      debug: 'false'
    })

    res.sendStatus(200)
  })

  const port = await createServer(t, app)

  await fetch('http://127.0.0.1:' + port, { query })
})

test('query string', async function (t) {
  t.plan(2)

  const app = express()

  app.get('/', function (req, res) {
    // Note: Don't depend on this raw query string as it could change in the future
    t.is(req.url, '/?something=b%21&else=a%25b%25c&items=x1%2Cx2&items=x3')

    t.alike(req.query, {
      something: 'b!',
      else: 'a%b%c',
      items: ['x1,x2', 'x3']
    })

    res.sendStatus(200)
  })

  const port = await createServer(t, app)

  const search = '?something=b!&else=a%b%c&items=x1,x2&items=x3#abc'

  await fetch('http://127.0.0.1:' + port + '/' + search)
})

test('controller manual abort should ignore retry', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
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

test('controller changes at every retry', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
  const port = await createServer(t, (req, res) => {
    const id = setTimeout(() => {}, 30000)
    res.on('close', () => clearTimeout(id))
  })

  const started = Date.now()

  // with timeout at 1 (one) we make it fail and just one retry is enough to change the "promise.controller"
  const promise = fetch('http://127.0.0.1:' + port, { timeout: 1, retry: { max: 1 } })
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

test('timeout + custom signal with controller should be ok', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
  const port = await createServer(t, (req, res) => {
    const id = setTimeout(() => {}, 30000)
    res.on('close', () => clearTimeout(id))
  })

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

test('timeout + custom controller without passing signal should be ok', { skip: NODE_MAJOR_VERSION < 20 }, async function (t) {
  const port = await createServer(t, (req, res) => {
    const id = setTimeout(() => {}, 30000)
    res.on('close', () => clearTimeout(id))
  })

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

test('could not send the request - node', async function (t) {
  try {
    await fetch('http://127.0.0.1:1234')
    t.fail('Should have given error')
  } catch (err) {
    t.is(err.code, 'ECONNREFUSED')
  }
})

test('could not send the request - browser', async function (t) {
  try {
    await fetch2('http://127.0.0.1:1234')
    t.fail('Should have given error')
  } catch (err) {
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
