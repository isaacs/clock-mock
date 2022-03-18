class Clock {
  constructor () {
    this._now = 0
    this.timers = Object.create(null)
    this.Date = MockDate(this)
  }

  now () {
    return Math.floor(this._now)
  }

  travel (to) {
    this._now = to
    this.advance(0)
  }

  advance (n) {
    const start = this._now
    this._now += n
    for (const [w, t] of Object.entries(this.timers)) {
      if (w <= this._now) {
        delete this.timers[w]
        t.forEach(({f}) => f())
      }
    }
  }

  setTimeout (f, n = 1) {
    n = Math.max(n, 1)
    const w = n + this.now()
    return new Timer(this, w, f)
  }

  clearTimeout (t) {
    t && t.clear && t.clear()
  }

  clearInterval (t) {
    this.clearTimeout(t)
  }

  setInterval (f, n = 1) {
    n = Math.max(n, 1)
    const t = this.setTimeout(() => {
      while (t.w <= this._now) {
        t.w += n
      }
      this.timers[t.w] = this.timers[t.w] || []
      this.timers[t.w].push(t)
      f()
    }, n)
    return t
  }

  hrtime (s = [0, 0]) {
    s = s[0] * 1e3 + s[1] / 1e6
    const r = this._now - s
    const sec = Math.floor(r / 1e3)
    const usec = Math.floor(((r / 1e3) % 1) * 1e9)
    return [sec, usec]
  }

  hrtimeBigint () {
    return BigInt(this._now * 1e6)
  }

  enter () {
    if (this._saved) {
      return
    }

    /* istanbul ignore next - backwards comp affordance */
    const {
      performance: { now } = require('perf_hooks').performance,
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      process: { hrtime },
    } = global
    const saved = this._saved = {
      performance: { now },
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      process: { hrtime },
    }

    /* istanbul ignore next - backwards comp affordance */
    const {
      performance: globalPerformance = require('perf_hooks').performance,
    } = global
    Object.defineProperty(globalPerformance, 'now', {
      value: () => this._saved === saved ? this._now : saved.performance.now,
      enumerable: true,
      configurable: true,
    })

    global.process.hrtime = (...a) =>
      this._saved === saved ? this.hrtime(...a)
        : saved.process.hrtime(...a)

    global.process.hrtime.bigint = () =>
      this._saved === saved ? this.hrtimeBigint()
        : saved.process.hrtime.bigint()

    const self = this
    global.Date = class extends this.Date {
      constructor (...args) {
        if (self._saved) {
          return new self.Date(...args)
        } else {
          return new saved.Date(...args)
        }
      }
    }

    global.setTimeout = (...a) =>
      this._saved === saved ? this.setTimeout(...a)
        : saved.setTimeout(...a)

    global.setInterval = (...a) =>
      this._saved === saved ? this.setInterval(...a)
        : saved.setInterval(...a)

    global.clearTimeout = (...a) =>
      this._saved === saved ? this.clearTimeout(...a)
        : saved.clearTimeout(...a)

    global.clearInterval = (...a) =>
      this._saved === saved ? this.clearInterval(...a)
        : saved.clearInterval(...a)

    return () => this.exit()
  }

  exit () {
    if (!this._saved) {
      return false
    }
    const {
      performance: { now },
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      process: { hrtime },
    } = this._saved
    this._saved = null

    /* istanbul ignore next - backwards comp affordance */
    const {
      performance: globalPerformance = require('perf_hooks').performance,
    } = global
    Object.defineProperty(globalPerformance, 'now', {
      value: now,
      enumerable: true,
      configurable: true,
    })

    global.process.hrtime = hrtime
    global.Date = Date
    global.setTimeout = setTimeout
    global.setInterval = setInterval
    global.clearTimeout = clearTimeout
    global.clearInterval = clearInterval
    return true
  }

  static get Timer () {
    return Timer
  }
}

const MockDate = clock => class extends Date {
  constructor (...args) {
    if (!args.length) {
      args = [clock.now()]
    }
    super(...args)
    this._clock = clock
  }
  static now () {
    return clock.now()
  }
}

class Timer {
  constructor (clock, w, f) {
    this.f = f
    this.w = w
    this.clock = clock
    this.reffed = true
    clock.timers[w] = clock.timers[w] || []
    clock.timers[w].push(this)
  }
  unref () {
    this.reffed = false
  }
  ref () {
    this.reffed = true
  }
  clear () {
    const list = this.clock.timers[this.w]
    if (list && list.length) {
      this.clock.timers[this.w] = list.filter(t => t !== this)
    }
  }
}

module.exports = Clock
