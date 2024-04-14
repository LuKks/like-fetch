module.exports = class LikeFetchError extends Error {
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
