import { promisify } from 'node:util'
import t from 'tap'
import { Clock, Timer } from '../dist/mjs/index.js'
const promisifySymbol = Symbol.for('nodejs.util.promisify.custom')

const {
  setTimeout: originalSetTimeout,
  setInterval: originalSetInterval,
  setImmediate: originalSetImmediate,
} = global

const c = new Clock()
t.equal(c.now(), 1, 'start at 1')

t.test('can clear global timers', t => {
  const int = setInterval(() => {
    throw new Error('global interval fired')
  })
  const st = setTimeout(() => {
    throw new Error('global timeout fired')
  })
  const imm = setImmediate(() => {
    throw new Error('global immediate fired')
  })
  c.clearInterval(int)
  c.clearTimeout(st)
  c.clearImmediate(imm)
  t.end()
})

t.test('setTimeout', t => {
  let calledTimeout = false
  c.setTimeout(() => {
    t.equal(calledTimeout, false, 'do not call multiple times')
    calledTimeout = true
  }, 10)
  c.advance(9)
  t.equal(calledTimeout, false)
  c.advance(1)
  t.equal(calledTimeout, true)
  t.end()
})

t.test('setTimeout pass by', t => {
  let calledTimeout = false
  c.setTimeout(() => {
    t.equal(calledTimeout, false, 'do not call multiple times')
    calledTimeout = true
  }, 10)
  c.advance(9)
  t.equal(calledTimeout, false)
  c.travel(c.now() + 101)
  t.equal(calledTimeout, true)
  t.end()
})

t.test('clearTimeout', t => {
  let calledTimeout = false
  const timer = c.setTimeout(() => {
    t.equal(calledTimeout, false, 'do not call multiple times')
    calledTimeout = true
  }, 10)
  t.equal(timer.reffed, true)
  timer.unref()
  t.equal(timer.reffed, false)
  timer.ref()
  t.equal(timer.reffed, true)
  c.clearTimeout(timer)
  c.advance(10)
  t.equal(calledTimeout, false)
  t.end()
})

t.test('setImmediate', t => {
  let calledImmediate = 0
  c.setImmediate(() => {
    t.equal(calledImmediate, 0, 'do not call multiple times')
    calledImmediate++
  })
  t.equal(calledImmediate, 0)
  c.advance(0)
  t.equal(calledImmediate, 1)
  c.advance(10)
  t.equal(calledImmediate, 1)
  t.end()
})

t.test('clearImmediate', t => {
  let calledImmediate = false
  const timer = c.setImmediate(() => {
    t.equal(calledImmediate, false, 'do not call multiple times')
    calledImmediate = true
  })
  t.equal(timer.reffed, true)
  timer.unref()
  t.equal(timer.reffed, false)
  timer.ref()
  t.equal(timer.reffed, true)
  c.clearImmediate(timer)
  c.advance(10)
  t.equal(calledImmediate, false)
  t.end()
})

t.test('setInterval', t => {
  let calledInterval = 0
  const interval = c.setInterval(() => calledInterval++, 10)
  t.equal(calledInterval, 0)
  c.advance(10)
  t.equal(calledInterval, 1)
  c.advance(1000)
  t.equal(calledInterval, 2)
  c.advance(10)
  t.equal(calledInterval, 3)
  c.clearInterval(interval)
  c.advance(10)
  t.equal(calledInterval, 3)
  t.end()
})

t.test('hrtime', t => {
  const before = c.hrtime()
  t.match(before, [Number, Number])
  c.advance(1234)
  const after = c.hrtime(before)
  t.same(after, [1, 234000000])
  t.end()
})

t.test('hrtime bigint', t => {
  const before = c.hrtimeBigint()
  t.match(before, BigInt)
  c.advance(1234)
  const after = c.hrtimeBigint()
  t.match(after, BigInt)
  t.equal(after - before, 1234000000n)
  t.end()
})

t.test('Date', t => {
  t.equal(c.Date.now(), c.now())
  const d = new c.Date()
  const dd = new Date(c.now())
  t.equal(d.toISOString(), dd.toISOString())
  const d1 = new c.Date('2022-03-17T00:05:47.293Z')
  t.equal(d1.toISOString(), '2022-03-17T00:05:47.293Z')
  t.end()
})

t.test('enter/exit', async t => {
  t.not(performance.now(), c.now())
  const { setTimeout, Date: OriginalDate } = global
  t.teardown(c.enter())
  t.type(new Date(), c.Date)
  t.not(setTimeout, global.setTimeout)
  t.same(process.hrtime(), c.hrtime())
  t.equal(process.hrtime.bigint(), c.hrtimeBigint())

  const timer = global.setTimeout(() => {})
  t.type(timer, Timer)
  clearTimeout(timer)

  let stCalled = 0
  global.setTimeout(() => stCalled++)
  t.equal(stCalled, 0)
  c.advance(5)
  t.equal(stCalled, 1)
  const pst = (async () => {
    stCalled += await promisify(global.setTimeout)(5, 1)
  })()
  t.equal(stCalled, 1)
  c.advance(5)
  await pst
  t.equal(stCalled, 2)

  // enter again is no-op
  c.enter()

  let immediateCalled = 0
  const immediate = setImmediate(() => immediateCalled++)
  // await Promise.resolve().then(() => {}).then(() => {})
  // await new Promise<void>(res => process.nextTick(() => res()))
  t.equal(immediateCalled, 0)
  c.advance(10)
  t.equal(immediateCalled, 1)
  clearImmediate(immediate)
  let immres: boolean = false
  const pimm = (async () => {
    immres = await promisify(setImmediate)(true)
  })()
  t.equal(immres, false)
  c.advance(0)
  await pimm
  t.equal(immres, true)

  let intervalCalled = 0
  const interval = setInterval(() => intervalCalled++, 10)
  c.advance(10)
  c.advance(10)
  t.equal(intervalCalled, 2)
  clearInterval(interval)
  c.advance(10)
  c.advance(10)
  t.equal(intervalCalled, 2)
  t.equal(performance.now(), c.now())

  let pints = 3
  const pint = (async () => {
    for await (const p of promisify(setInterval)(10, pints)) {
      t.equal(p, 3)
      if (--pints === 0) break
    }
  })()
  while (pints > 0) {
    c.advance(10)
    await Promise.resolve()
  }
  await pint

  // grabbing a ref before exit still puts it back how it was
  const D = global.Date
  t.equal(D(), String(new OriginalDate(c.now())))
  t.equal(D.now(), c.now())
  t.equal(Date.now(), c.now())
  const { now: perfNow } = performance
  const { hrtime } = process
  const { bigint: hrtimeBigint } = hrtime
  const {
    setTimeout: sT,
    setInterval: sI,
    setImmediate: sIm,
    clearTimeout: cT,
    clearInterval: cI,
    clearImmediate: cIm,
  } = global

  c.exit()
  t.type(new D(), global.Date)
  t.equal(D.now(), OriginalDate.now())
  t.equal(D(), OriginalDate())
  t.not(perfNow(), c.now())
  t.notSame(hrtime(), c.hrtime())
  t.not(hrtimeBigint(), c.hrtimeBigint())

  const timerSet = sT(() => {})
  t.notMatch(timerSet, Timer)
  cT(timerSet)

  const intervalSet = sI(() => {})
  t.notMatch(intervalSet, Timer)
  cI(intervalSet)

  const immediateSet = sIm(() => {})
  t.notMatch(immediateSet, Timer)
  cIm(immediateSet)

  t.equal(global.setTimeout, setTimeout)
  t.not(performance.now(), c.now())

  c.exit()
  t.equal(global.setTimeout, setTimeout)
  t.not(performance.now(), c.now())

  // the proxies should all go through to the actual promisified forms now
  t.equal(promisify(sT), promisify(originalSetTimeout))
  // note: this doesn't actually work like it seems like it should in node 16
  // and 18, and like the types indicate that it does. In those versions,
  // both of these are undefined. As of node 20, it works as expected.
  // see: https://github.com/nodejs/node/issues/49115
  //@ts-ignore
  t.equal(sI[promisifySymbol], originalSetInterval[promisifySymbol])
  t.equal(promisify(sIm), promisify(originalSetImmediate))
  t.end()
})

t.test('n always >= 1', t => {
  let timeoutCalled = false
  c.setTimeout(() => (timeoutCalled = true), -100)
  let intervalCalled = 0
  const interval = c.setInterval(() => intervalCalled++, 0)
  t.equal(timeoutCalled, false)
  t.equal(intervalCalled, 0)
  c.advance(1)
  t.equal(timeoutCalled, true)
  timeoutCalled = false
  t.equal(intervalCalled, 1)
  c.advance(1)
  t.equal(timeoutCalled, false)
  t.equal(intervalCalled, 2)
  c.clearInterval(interval)
  c.clearInterval(interval)
  c.clearInterval(interval)
  c.clearInterval(interval)
  t.end()
})

t.test('n default 1', t => {
  let timeoutCalled = false
  c.setTimeout(() => (timeoutCalled = true))
  let intervalCalled = 0
  const interval = c.setInterval(() => intervalCalled++)
  t.equal(timeoutCalled, false)
  t.equal(intervalCalled, 0)
  c.advance(1)
  t.equal(timeoutCalled, true)
  timeoutCalled = false
  t.equal(intervalCalled, 1)
  c.advance(1)
  t.equal(timeoutCalled, false)
  t.equal(intervalCalled, 2)
  c.clearInterval(interval)
  t.end()
})

t.test('multiple timers on same tick', t => {
  let called1 = false
  let called2 = false
  c.setTimeout(() => (called1 = true), 1)
  c.setTimeout(() => (called2 = true), 1)
  t.equal(called1, false)
  t.equal(called2, false)
  c.advance(1)
  t.equal(called1, true)
  t.equal(called2, true)
  t.end()
})

t.test('multiple intervals on same tick', t => {
  let called1 = 0
  let called2 = 0
  const int1 = c.setInterval(() => called1++, 1)
  const int2 = c.setInterval(() => called2++, 1)
  t.equal(called1, 0)
  t.equal(called2, 0)
  c.advance(1)
  t.equal(called1, 1)
  t.equal(called2, 1)
  c.advance(1)
  t.equal(called1, 2)
  t.equal(called2, 2)
  c.clearTimeout(int1)
  c.advance(1)
  t.equal(called1, 2)
  t.equal(called2, 3)
  c.clearTimeout(int2)
  c.advance(1)
  t.equal(called1, 2)
  t.equal(called2, 3)
  t.end()
})

t.test('precision with floats', t => {
  const s = c.now()
  const before = c.hrtime()
  c.advance(123.45678)
  const comp = c.hrtime(before)
  t.match(comp, [0, Number])
  // floats, ugh
  t.equal(
    Math.max(10, Math.abs(comp[1] - 123456780)),
    10,
    'got within float accuracy'
  )

  c.travel(s)
  const b = c.hrtime(before)
  t.match(b, [0, Number])
  t.equal(Math.max(b[1], 10), 10)

  t.end()
})

t.test('go with the flow', async t => {
  let resolved = false
  new Promise<void>(res => c.setTimeout(() => res(), 50)).then(
    () => (resolved = true)
  )
  await c.flow(100)
  t.equal(resolved, true)
})

t.test('setTimeout promise with cancel', async t => {
  const ac = new AbortController()
  const { signal } = ac
  const poop = new Error('poop')
  const ok = c.setTimeoutPromise(5, true, { signal, reffed: false })
  c.advance(10)
  t.equal(await ok, true)
  const p = t.rejects(c.setTimeoutPromise(5, true, { signal }), poop)
  ac.abort(poop)
  c.advance(10)
  await p
  const p2 = t.rejects(
    c.setTimeoutPromise(5, undefined, { signal, reffed: false }),
    poop
  )
  c.advance(10)
  await p2
})

t.test('setImmediate promise with cancel', async t => {
  const ac = new AbortController()
  const { signal } = ac
  const poop = new Error('poop')
  const ok = c.setImmediatePromise(true, { signal, reffed: false })
  c.advance(0)
  t.equal(await ok, true)
  const p = t.rejects(c.setImmediatePromise(true, { signal }), poop)
  ac.abort(poop)
  c.advance(0)
  await p
  const p2 = t.rejects(
    c.setImmediatePromise(undefined, { signal }),
    poop
  )
  c.advance(0)
  await p2
})

t.test('async timer methods with default args', async t => {
  const stp = c.setTimeoutPromise()
  const intgen = c.setIntervalPromise()
  const intp = (async () => {
    for await (const i of intgen) {
      return i
    }
  })()
  const immp = c.setImmediatePromise()
  c.advance(1)
  await Promise.resolve()
  c.advance(1)
  await Promise.resolve()
  c.advance(1)
  await Promise.resolve()
  t.equal(await immp, undefined, 'immediate promise resolved')
  t.equal(await stp, undefined, 'timeout promise resolved')
  t.equal(await intp, undefined, 'interval promise resolved')
})

t.test('promisified timer methods', async t => {
  const stp = promisify(c.setTimeout)()
  const intgen = promisify(c.setInterval)()
  const intp = (async () => {
    for await (const i of intgen) {
      return i
    }
  })()
  const immp = promisify(c.setImmediate)()
  c.advance(1)
  await Promise.resolve()
  c.advance(1)
  await Promise.resolve()
  c.advance(1)
  await Promise.resolve()
  t.equal(await immp, undefined, 'immediate promise resolved')
  t.equal(await stp, undefined, 'timeout promise resolved')
  t.equal(await intp, undefined, 'interval promise resolved')
})

t.test('setImmediate with args', t => {
  let a: number[] = []
  const f = (x: number, y: number, z: number) => (a = [x, y, z])
  c.setImmediate(f, 1, 2, 3)
  c.advance(0)
  t.strictSame(a, [1, 2, 3])
  t.end()
})

t.test('setTimeout with args', t => {
  let a: number[] = []
  const f = (x: number, y: number, z: number) => (a = [x, y, z])
  c.setTimeout(f, 10, 1, 2, 3)
  c.advance(10)
  t.strictSame(a, [1, 2, 3])
  t.end()
})

t.test('setInterval with args', t => {
  let a: number[] = []
  const f = (x: number, y: number, z: number) => (a = [x, y, z])
  c.setInterval(f, 10, 1, 2, 3)
  c.advance(10)
  t.strictSame(a, [1, 2, 3])
  t.end()
})
