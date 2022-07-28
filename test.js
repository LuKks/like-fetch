const tape = require('tape')
const fetch = require('./')
const net = require('net')

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

tape('timeout body', async function (t) {
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
  } catch (error) {
    t.is(error.constructor.name, 'Response')
  }

  try {
    await fetch('https://api.agify.io/not-found', { validateStatus: 'ok' })
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.constructor.name, 'Response')
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
  } catch (error) {
    t.is(error.constructor.name, 'Response')
  }
})

tape('request types', async function (t) {
  const response = await fetch('http://api.shoutcloud.io/V1/SHOUT', { method: 'POST', requestType: 'json', body: { input: 'lucas' } })
  const body = await response.json()
  t.is(body.OUTPUT, 'LUCAS')
})

tape('response types', async function (t) {
  const body1 = await fetch('https://api.agify.io/?name=lucas', { responseType: 'json' })
  t.is(typeof body1, 'object')
  t.is(body1.name, 'lucas')

  const body2 = await fetch('https://api.agify.io/?name=lucas', { responseType: 'text' })
  t.is(typeof body2, 'string')
  t.ok(body2.indexOf('{"name":"lucas"') === 0)
})

tape('controller manual abort should ignore retry', async function (t) {
  const started = Date.now()

  try {
    const promise = fetch('https://checkip.amazonaws.com', { retry: { max: 3, delay: 1000 }})
    promise.controller.abort()
    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
  }

  t.ok(isAround(Date.now() - started, 0))
})

tape('controller (wrong usage of controller)', async function (t) {
  const started = Date.now()

  let promise = null
  let controller = null
  try {
    // with timeout at 1 (one) we make it fail and just one retry is enough to change the "promise.controller"
    promise = fetch('https://checkip.amazonaws.com', { timeout: 1, retry: { max: 1 }})
    controller = promise.controller
    await promise
    t.ok(false, 'Should have given error')
  } catch (error) {
    t.is(error.name, 'AbortError')
    t.ok(controller !== null)
    t.ok(promise.controller !== controller) // controller changed!
  }

  t.ok(isAround(Date.now() - started, 0))
})

function isAround (delay, real, precision = 150) {
  const diff = Math.abs(delay - real)
  return diff <= precision
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
