# like-fetch

Fetch with added features: timeout, retry, status validation, simplified response, etc.

![](https://img.shields.io/npm/v/like-fetch.svg) ![](https://img.shields.io/github/license/LuKks/like-fetch.svg)

```
npm i like-fetch
```

Compatible with Node.js, browser and React Native.\
All options are optional, so by default it's the same as a normal `fetch(...)`.

## Usage
```javascript
const fetch = require('like-fetch')

// As usual
const response = await fetch('https://example.com')
const body = await response.text()

// Using some features
const ip = await fetch('https://example.com', {
  timeout: 5000, // Uses AbortController, signal, etc
  retry: { max: 3 }, // This retry object is passed to like-retry
  validateStatus: 'ok', // Throw if status is not correct
  requestType: 'json', // Will automatically do JSON.stringify(body)
  responseType: 'json' // Will automatically do response.json()
})
```

## Timeout
```javascript
const response = await fetch('https://example.com', { timeout: 5000 })
const body = await response.json()
// Throws an AbortError in case of timeout (for both request and body consuming)
```

## Retry
```javascript
const retry = { max: 5, delay: 3000, strategy: 'linear' }
const response = await fetch('https://example.com', { retry })
// If the first attempt fails then: waits 3s and retries, 6s, 9s, 12s, 15s and finally throws
```

Check [like-retry](https://github.com/LuKks/like-retry) for documentation about `retry` option.

## Status validation
```javascript
// response.status must match 200, otherwise throws
const response = await fetch('https://example.com', { validateStatus: 200 })

// response.ok must be true
const response = await fetch('https://example.com', { validateStatus: 'ok' })

// Custom function, must return true
const validateStatus = status => status >= 200 && status < 300
const response = await fetch('https://example.com', { validateStatus })
```

At this moment, when `validateStatus` fails it throws the `response` object.

## Request types
```javascript
// Sets the 'Content-Type' header to 'application/json'
// And if body is not undefined then does a JSON.stringify(body)
const response = await fetch('https://example.com', { requestType: 'json', body: { username: 'test' } })

// Sets the 'Content-Type' header to 'application/x-www-form-urlencoded'
// And if body is not undefined then it stringifes URLSearchParams using the body
const response = await fetch('https://example.com', { requestType: 'url', body: { username: 'test' } })
```

## Response types
```javascript
// Sets the 'Accept' header to 'application/json' and does response.json()
const body = await fetch('https://example.com', { responseType: 'json' })
console.log(body) // => Object {...}

// Automatic response.text()
const body = await fetch('https://example.com', { responseType: 'text' })
console.log(body) // => String '...'
```

## Signal controller
Just using `useEffect` as an example of manual cancelling the request.

```javascript
useEffect(() => {
  if (!account) return

  // Start request
  const promise = fetch('https://example.com/api/balance/' + account, { responseType: 'json' })

  // Propagate values
  promise.then(body => setBalance(body.balance))

  // Handle exceptions
  promise.catch(error => setBalance('~'))

  // Clean up
  return () => promise.controller.abort()
}, [account])
```

## License
MIT
