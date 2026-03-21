const { EventEmitter } = require('events')

const emitter = new EventEmitter()
emitter.setMaxListeners(200)

module.exports = emitter
