const globalClearTimeout = clearTimeout
const globalClearInterval = clearInterval
const globalClearImmediate = clearImmediate
const promisifySymbol = Symbol.for('nodejs.util.promisify.custom')

/**
 * When entering a clock, the current state of the global is saved If another
 * clock was already entered, it will revert back to that when exiting.
 *
 * When we exit, if the monkey-patched global proxies get called, they will
 * revert back to whatever the saved value was when they were patched. If that
 * is another exited clock, it will proxy back to its original saved state, and
 * so on, eventually hitting the original global state again if all clocks in
 * the stack have been exited.
 */
export interface Saved {
  performance: { now: () => number }
  Date: typeof Date | ReturnType<typeof MockDate>
  setTimeout: SetTimeout
  setInterval: SetInterval
  setImmediate: SetImmediate
  clearTimeout: typeof clearTimeout
  clearInterval: typeof clearInterval
  clearImmediate: typeof clearImmediate
  process: {
    hrtime: {
      (t?: [number, number]): [number, number]
      bigint(): bigint
    }
  }
}

/**
 * The promisified form of setTimeout
 */
export interface SetTimeoutPromise {
  (
    n?: number,
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<void>
  <T = void>(
    n: number,
    value: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<T>
}

/**
 * setTimeout which can be promisified
 */
export interface SetTimeout {
  (f: (a: void) => any, n?: number): Timer
  <TArgs extends any[]>(
    f: (...a: TArgs) => any,
    n?: number,
    ...a: TArgs
  ): Timer
  __promisify__: SetTimeoutPromise
  [promisifySymbol]: SetTimeoutPromise
}

/**
 * Promisified form of setInterval
 */
export interface SetIntervalPromise {
  (
    n?: number,
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): AsyncGenerator<void>
  <T = void>(
    n?: number,
    value?: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): AsyncGenerator<T>
}

/**
 * setInterval which can be promisified
 */
export interface SetInterval {
  (f: (a: void) => any, n?: number): Timer
  <TArgs extends any[]>(
    f: (...a: TArgs) => any,
    n?: number,
    ...a: TArgs
  ): Timer
  __promisify__: SetIntervalPromise
  [promisifySymbol]: SetIntervalPromise
}

/**
 * The promisified form of setImmediate
 */
export interface SetImmediatePromise {
  (
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<void>
  <T = void>(
    value: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<T>
}

/**
 * setImmediate which can be promisified
 */
export interface SetImmediate {
  (f: (a: void) => any): Timer
  <TArgs extends any[]>(f: (...a: TArgs) => any, ...a: TArgs): Timer
  __promisify__: SetImmediatePromise
  [promisifySymbol]: SetImmediatePromise
}

/**
 * Interface of an object with timer methods
 */
export interface TimerProvider {
  setTimeout: SetTimeout
  setInterval: SetInterval
  setImmediate: SetImmediate
}

/**
 * The mock clock implementation
 */
export class Clock implements TimerProvider {
  #now: number = 0
  #timers: Map<number, Timer[]> = new Map()
  get timers() {
    return this.#timers
  }
  Date: ReturnType<typeof MockDate>
  #saved?: Saved

  /**
   * Schedule a function to be run when the clock has advanced `n` ms beyond
   * the current point.
   *
   * Only ms granularity.
   */
  setTimeout: SetTimeout

  /**
   * Schedule a function to be run when the clock advances each multiple
   * of `n` past the current point.
   *
   * If multiple steps are advanced at once, for example doing
   * `c.setInterval(fn, 1) ; c.advance(1000)`, then it will only call the
   * function once.  This allows you to simulate clock jitter.
   *
   * Only ms granularity.
   */
  setInterval: SetInterval

  /**
   * Schedule a function to be run the next time the clock is advanced by
   * any ammount.
   */
  setImmediate: SetImmediate

  constructor() {
    this.#now = 0
    this.Date = MockDate(this)
    const setTimeoutPromise: SetTimeoutPromise = (
      n?: number,
      value?: any,
      options: {
        signal?: AbortSignal
        reffed?: boolean
      } = {}
    ): Promise<typeof value> =>
      this.setTimeoutPromise(n, value, options)
    this.setTimeout = Object.assign(this.#setTimeout, {
      __promisify__: setTimeoutPromise,
      [promisifySymbol]: setTimeoutPromise,
    })

    const setIntervalPromise: SetIntervalPromise = (
      n: number = 1,
      value?: any,
      options: {
        signal?: AbortSignal
        reffed?: boolean
      } = {}
    ): AsyncGenerator<typeof value> =>
      this.setIntervalPromise(n, value, options)
    this.setInterval = Object.assign(this.#setInterval, {
      __promisify__: setIntervalPromise,
      [promisifySymbol]: setIntervalPromise,
    })

    const setImmediatePromise: SetImmediatePromise = (
      value?: any,
      options: {
        signal?: AbortSignal
        reffed?: boolean
      } = {}
    ): Promise<typeof value> =>
      this.setImmediatePromise(value, options)
    this.setImmediate = Object.assign(this.#setImmediate, {
      __promisify__: setImmediatePromise,
      [promisifySymbol]: setImmediatePromise,
    })
  }

  /**
   * Returns the current ms time on the clock.
   */
  now() {
    return Math.floor(this.#now)
  }

  /**
   * Set the clock to a specific time.  Will fire timers that you zoom past.
   */
  travel(to: number) {
    this.#now = to
    this.advance(0)
  }

  /**
   * Advance the clock by `n` ms.  Use floats for smaller increments of time.
   */
  advance(n: number) {
    this.#now += n
    for (const [w, t] of this.timers.entries()) {
      if (w <= this.#now) {
        this.timers.delete(w)
        t.forEach(({ _onTimeout: f }) => f && f())
      }
    }
  }

  /**
   * Advance the clock in steps, awaiting a Promise at each step, so that
   * actual asynchronous events can occur, as well as timers.
   */
  async flow(n: number, step = 5) {
    do {
      this.advance(step)
      await Promise.resolve()
    } while (0 <= (n -= step))
  }

  #setImmediate(f: (...a: any[]) => any, ...a: any[]) {
    const fn = a.length ? () => f(...a) : f
    return new Timer(this, this.now(), fn)
  }

  /**
   * The promisified setImmediate, also available via
   * `promisify(clock.setImmediate)`
   */
  async setImmediatePromise(
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<void>
  async setImmediatePromise<T = void>(
    value: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<T>
  async setImmediatePromise(
    value?: any,
    options: {
      signal?: AbortSignal
      reffed?: boolean
    } = {}
  ): Promise<typeof value> {
    const { signal, reffed = true } = options
    if (signal?.aborted) {
      /* c8 ignore start */
      throw signal.reason || new Error('The operation was aborted')
      /* c8 ignore stop */
    }
    let res!: (v: typeof value) => void
    let rej!: (er: unknown) => void
    const p = new Promise<typeof value>((s, j) => {
      res = s
      rej = j
    })
    const timer = this.setImmediate(() => res(value))
    if (!reffed) timer.unref()
    if (!signal) return p
    const cancel = () => {
      this.clearTimeout(timer)
      rej(
        /* c8 ignore start */
        signal.reason || new Error('The operation was aborted')
        /* c8 ignore stop */
      )
    }
    signal.addEventListener('abort', cancel, { once: true })
    return p.then(v => {
      signal.removeEventListener('abort', cancel)
      return v
    })
  }

  #setTimeout(f: (...a: any[]) => any, n = 1, ...a: any[]): Timer {
    n = Math.max(n, 1)
    const fn = a.length ? () => f(...a) : f
    const w = n + this.now()
    return new Timer(this, w, fn)
  }

  /**
   * The promisified setTimeout, also available via
   * `promisify(clock.setTimeout)`
   */
  async setTimeoutPromise(
    n?: number,
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<void>
  async setTimeoutPromise<T = void>(
    n: number,
    value: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): Promise<T>
  async setTimeoutPromise(
    n?: number,
    value?: any,
    options: {
      signal?: AbortSignal
      reffed?: boolean
    } = {}
  ): Promise<typeof value> {
    const { signal, reffed = true } = options
    if (signal?.aborted) {
      /* c8 ignore start */
      throw signal.reason || new Error('The operation was aborted')
      /* c8 ignore stop */
    }
    let res!: (v: typeof value) => void
    let rej!: (er: unknown) => void
    const p = new Promise<typeof value>((s, j) => {
      res = s
      rej = j
    })
    const timer = this.setTimeout(() => res(value), n)
    if (!reffed) timer.unref()
    if (!signal) {
      return p
    }
    const cancel = () => {
      this.clearTimeout(timer)
      /* c8 ignore start */
      rej(signal.reason || new Error('The operation was aborted'))
      /* c8 ignore stop */
    }
    signal.addEventListener('abort', cancel, { once: true })
    return p.then(v => {
      signal.removeEventListener('abort', cancel)
      return v
    })
  }

  /**
   * Clear a timeout created by the clock.
   */
  clearTimeout(t: Timer | NodeJS.Timer) {
    if (t) {
      if (typeof (t as Timer).clear === 'function')
        (t as Timer).clear()
      else globalClearTimeout(t as NodeJS.Timer)
    }
  }

  /**
   * Clear an interval created by the clock. (alias for
   * {@link Clock#clearTimeout})
   */
  clearInterval(t: Timer | NodeJS.Timer) {
    if (t) {
      if (typeof (t as Timer).clear === 'function')
        (t as Timer).clear()
      else globalClearInterval(t as NodeJS.Timer)
    }
  }

  /**
   * Clear an setImmediate timer created by the clock. (alias for
   * {@link Clock#clearTimeout})
   */
  clearImmediate(t: Timer | NodeJS.Immediate) {
    if (t) {
      if (typeof (t as Timer).clear === 'function')
        (t as Timer).clear()
      else globalClearImmediate(t as NodeJS.Immediate)
    }
  }

  #setInterval(f: (...a: any[]) => any, n = 1, ...a: any[]) {
    n = Math.max(n, 1)
    const fn = a.length ? () => f(...a) : f
    const t = this.setTimeout(() => {
      while (t.w <= this.#now) {
        t.w += n
      }
      const timers = this.timers.get(t.w) || []
      timers.push(t)
      this.timers.set(t.w, timers)
      fn()
    }, n)
    return t
  }

  /**
   * promisified `setInterval`, also available via
   * `promisify(clock.setImmediate)`
   */
  setIntervalPromise(
    n?: number,
    value?: undefined,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): AsyncGenerator<void>
  setIntervalPromise<T = void>(
    n?: number,
    value?: T,
    options?: {
      signal?: AbortSignal
      reffed?: boolean
    }
  ): AsyncGenerator<T>
  async *setIntervalPromise(
    n: number = 1,
    value?: any,
    options: {
      signal?: AbortSignal
      reffed?: boolean
    } = {}
  ): AsyncGenerator<typeof value> {
    // the signal will just cause the timeout promise to reject,
    // so there's really not much to do here.
    while (true) {
      yield await this.setTimeoutPromise(n, value, options)
    }
  }

  /**
   * Mock of `process.hrtime()`, returning `[seconds, nanoseconds]` on the
   * clock.
   */
  hrtime(s: [number, number] = [0, 0]): [number, number] {
    const t = s[0] * 1e3 + s[1] / 1e6
    const r = this.#now - t
    const sec = Math.floor(r / 1e3)
    const usec = Math.floor(((r / 1e3) % 1) * 1e9)
    return [sec, usec]
  }

  /**
   * Mock of `process.hrtime.bigint()`, returning BigInt representation of
   * current nanosecond time.
   */
  hrtimeBigint() {
    return BigInt(this.#now * 1e6)
  }

  /**
   * Mocks all the things in the global space.
   *
   * Returns exit function, for ease of doing `t.teardown(c.enter())`.
   */
  enter() {
    if (this.#saved) {
      /* c8 ignore start */
      return () => {}
      /* c8 ignore stop */
    }

    /* istanbul ignore next - backwards comp affordance */
    const {
      performance: { now } = require('perf_hooks').performance,
      Date,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      process: { hrtime },
    } = global
    const saved: Saved = (this.#saved = {
      performance: { now },
      Date,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      process: { hrtime },
    } as unknown as Saved)

    const { performance: globalPerformance } = global
    Object.defineProperty(globalPerformance, 'now', {
      value: () =>
        this.#saved === saved ? this.#now : saved.performance.now,
      enumerable: true,
      configurable: true,
    })

    global.process.hrtime = Object.assign(
      (a?: [number, number]) =>
        this.#saved === saved
          ? this.hrtime(a)
          : saved.process.hrtime(a),
      {
        bigint: () =>
          this.#saved === saved
            ? this.hrtimeBigint()
            : saved.process.hrtime.bigint(),
      }
    )

    const self = this
    const { now: _now, ...dateProps } = global.Date
    global.Date = Object.assign(
      function Date(...args: any) {
        const D = self.#saved === saved ? self.Date : saved.Date
        return !new.target
          ? String(new D())
          : Reflect.construct(D, args)
      },
      {
        ...dateProps,
        now: () =>
          self.#saved === saved ? self.now() : saved.Date.now(),
      }
    ) as typeof global.Date

    type KPromisify = '__promisify__' | typeof promisifySymbol
    const proxyPromisify = <F extends (...a: any[]) => any>(
      fn: F,
      method: 'setTimeout' | 'setInterval' | 'setImmediate'
    ) => {
      const who = () => (this.#saved === saved ? this : saved)
      const m = (p: KPromisify) => who()[method][p]
      const prop = (p: KPromisify): PropertyDescriptor => ({
        get: () => m(p),
        configurable: true,
        enumerable: true,
      })
      return Object.defineProperties(fn, {
        __promisify__: prop('__promisify__'),
        [promisifySymbol]: prop(promisifySymbol),
      })
    }

    function setTimeoutProxy(
      fn: (a: void) => any,
      n?: number
    ): Timer | NodeJS.Timer
    function setTimeoutProxy<TArgs extends any[]>(
      fn: (...a: TArgs) => any,
      n?: number,
      ...a: TArgs
    ): Timer | NodeJS.Timer
    function setTimeoutProxy(
      fn: (...a: any[]) => any,
      n?: number,
      ...a: any[]
    ) {
      return self.#saved === saved
        ? self.setTimeout(fn, n, ...a)
        : saved.setTimeout(fn, n, ...a)
    }

    global.setTimeout = proxyPromisify(
      setTimeoutProxy,
      'setTimeout'
    ) as unknown as typeof global.setTimeout

    function setIntervalProxy(
      f: (a: void) => any,
      n?: number
    ): NodeJS.Timer | Timer
    function setIntervalProxy<TArgs extends []>(
      f: (...a: TArgs) => any,
      n?: number,
      ...a: TArgs
    ): NodeJS.Timer | Timer
    function setIntervalProxy(
      f: (...a: any[]) => any,
      n = 1,
      ...a: any[]
    ): NodeJS.Timer | Timer {
      return self.#saved === saved
        ? self.setInterval<any[]>(f, n, ...a)
        : saved.setInterval(f, n, ...a)
    }

    global.setInterval = proxyPromisify(
      setIntervalProxy,
      'setInterval'
    ) as unknown as typeof global.setInterval

    function setImmediateProxy(
      fn: (a: void) => any
    ): Timer | NodeJS.Timer
    function setImmediateProxy<TArgs extends any[]>(
      fn: (...a: TArgs) => any,
      ...a: TArgs
    ): Timer | NodeJS.Timer
    function setImmediateProxy(
      fn: (...a: any[]) => any,
      ...a: any[]
    ) {
      return self.#saved === saved
        ? self.setImmediate(fn, ...a)
        : saved.setImmediate(fn, ...a)
    }

    global.setImmediate = proxyPromisify(
      setImmediateProxy,
      'setImmediate'
    ) as unknown as typeof global.setImmediate

    global.clearTimeout = (t: any) =>
      this.#saved === saved
        ? this.clearTimeout(t)
        : saved.clearTimeout(t)

    global.clearInterval = (t: any) =>
      this.#saved === saved
        ? this.clearInterval(t)
        : saved.clearInterval(t)

    global.clearImmediate = (t: any) =>
      this.#saved === saved
        ? this.clearImmediate(t)
        : saved.clearImmediate(t)

    return () => this.exit()
  }

  /**
   * If entered, exit the clock, restoring the global state
   */
  exit() {
    if (!this.#saved) {
      return false
    }
    const {
      performance: { now },
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      clearImmediate,
      process: { hrtime },
    } = this.#saved
    this.#saved = undefined

    const { performance: globalPerformance } = global
    Object.defineProperty(globalPerformance, 'now', {
      value: now,
      enumerable: true,
      configurable: true,
    })

    Object.assign(global.process, { hrtime })
    Object.assign(global, {
      Date,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      clearImmediate,
    })
    return true
  }
}

/**
 * Create a class like `Date`, but with its `now` value tied
 * to the value of a {@link Clock} instance.
 */
export const MockDate = (clock: Clock) => {
  return class MockDate extends Date {
    constructor(...args: any[]) {
      if (!args.length) args.push(clock.now())
      super(...(args as Parameters<typeof Date>))
    }
    static now() {
      return clock.now()
    }
  }
}

/**
 * A Timer that lives in the mock clock
 */
export class Timer {
  /**
   * {@link Clock} governing this timer
   */
  clock: Clock
  /**
   * When this timer should fire
   */
  w: number
  /**
   * use the property name `_onTimeout` so that the global `clearTimeout`
   * method in Node will make it no-op if it gets passed there.
   */
  _onTimeout: null | ((...a: any[]) => any)
  /**
   * set by {@link Timer#unref}
   *
   * These timers don't keep the event loop open anyway, so this doesn't
   * do much, but it's useful when testing to ensure that a timeout
   * had .ref() or .unref() called on it.
   */
  reffed: boolean = true
  constructor(clock: Clock, w: number, f: (...a: any[]) => any) {
    this._onTimeout = f
    this.w = Math.floor(w)
    this.clock = clock
    const timers = clock.timers.get(w) || []
    timers.push(this)
    clock.timers.set(w, timers)
  }
  /**
   * simulacrum of node's Timer.unref. Just sets the {@link Timer#ref} field.
   */
  unref() {
    this.reffed = false
  }
  /**
   * simulacrum of node's Timer.ref. Just sets the {@link Timer#ref} field.
   */
  ref() {
    this.reffed = true
  }
  /**
   * Remove this timer from the clock's queue.
   */
  clear() {
    this._onTimeout = null
    const list = this.clock.timers.get(this.w)
    if (list && list.length) {
      this.clock.timers.set(
        this.w,
        list.filter(t => t !== this)
      )
    }
  }
}
