module.exports = function (signal) {
  if (!signal || !signal.aborted) return null

  try {
    signal.throwIfAborted()
  } catch (err) {
    return err
  }

  return null
}
