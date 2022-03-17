const Clock = require('../')
const t = require('tap')

global.performance = global.performance || require('perf_hooks').performance

const c = new Clock()
t.equal(c.now(), 0, 'start at zero')

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

t.test('enter/exit', t => {
  t.not(performance.now(), c.now())
  const {setTimeout} = global
  t.teardown(c.enter())
  t.equal(Date, c.Date)
  t.not(setTimeout, global.setTimeout)
  t.same(process.hrtime(), c.hrtime())
  t.equal(process.hrtime.bigint(), c.hrtimeBigint())

  const timer = global.setTimeout(() => {})
  t.type(timer, Clock.Timer)
  clearTimeout(timer)

  let intervalCalled = 0
  const interval = setInterval(() => intervalCalled ++, 10)
  c.advance(10)
  c.advance(10)
  t.equal(intervalCalled, 2)
  clearInterval(interval)
  c.advance(10)
  c.advance(10)
  t.equal(intervalCalled, 2)
  t.equal(performance.now(), c.now())
  c.exit()
  t.equal(global.setTimeout, setTimeout)
  t.not(performance.now(), c.now())
  c.exit()
  t.equal(global.setTimeout, setTimeout)
  t.not(performance.now(), c.now())
  t.end()
})

t.test('n always >= 1', t => {
  let timeoutCalled = false
  c.setTimeout(() => timeoutCalled = true, -100)
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
  c.setTimeout(() => timeoutCalled = true)
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
  c.setTimeout(() => called1 = true, 1)
  c.setTimeout(() => called2 = true, 1)
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
  const s = c._now
  const before = c.hrtime()
  c.advance(123.456784)
  t.same(c.hrtime(before), [0, 123456783]) // gotta ""love"" floats
  c.travel(s)
  t.same(c.hrtime(before), [0, 0])
  t.end()
})
