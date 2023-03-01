# clock-mock

A mock clock for tests involving timing.

Don't just use `setTimeout()` and hope that the timings work out.  This
makes tests take forever and be non-deterministic and flaky.

Instead, mock the clock, and explicitly advance it so you can test timing
issues precisely and deterministically.

## USAGE

```js
const Clock = require('clock-mock')

const t = require('tap') // or whatever you use

// the module you wrote that does timing stuff
const myModuleThatDoesStuffWithTime = require('../index.js')

t.test('test timeouts precisely', t => {
  const c = new Clock()
  c.enter()
  myModuleThatDoesStuffWithTime.scheduleThing('foo', 100)
  c.advance(99)
  t.equal(myModuleThatDoesStuffWithTime.thingRan('foo'), false)
  c.advance(1) // the timeout fired!
  t.equal(myModuleThatDoesStuffWithTime.thingRan('foo'), true)

  c.exit()
  t.end()
})
```

Patches:

* Date class
* setTimeout
* setInterval
* clearTimeout
* clearInterval
* performance.now()
* process.hrtime
* process.hrtime.bigint

## API

* `const c = new Clock()`

    Returns a new Clock instance

* `c.advance(n)`

    Advance the clock by `n` ms.  Use floats for smaller increments of
    time.

* `c.flow(n, step = 5) => Promise<void>`

    Advance the clock in steps, awaiting a Promise at each step,
    so that actual asynchronous events can occur, as well as
    timers.

* `c.travel(time)`

    Set the clock to a specific time.  Will fire timers that you zoom past.

* `c.enter()`

    Mocks all the things in the global space.

    Returns exit function, for ease of doing `t.teardown(c.enter())`.

* `c.exit()`

    Puts all the mocked globals back to their prior state.

* `c.setTimeout(fn, n = 1)`

    Schedule a function to be run when the clock has advanced `n` ms beyond
    the current point.

    Only ms granularity.

* `c.setInterval(fn, n = 1)`

    Schedule a function to be run when the clock advances each multiple of
    `n` past the current point.

    If multiple steps are advanced at once, for example doing
    `c.setInterval(fn, 1) ; c.advance(1000)`, then it will only call the
    function once.  This allows you to simulate clock jitter.

    Only ms granularity.

* `c.clearTimeout(timer)`

    Clear a timeout created by the clock.

* `c.clearInterval(interval)`

    Clear an interval created by the clock.

* `c.now()`

    Returns the current ms time on the clock.

* `c.hrtime()`

    Mock of `process.hrtime()`, returning `[seconds, nanoseconds]` on the
    clock.

* `c.hrtimeBigint()`

    Mock of `process.hrtime.bigint()`, returning BigInt representation of
    current nanosecond time.
