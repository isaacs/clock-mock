/// <reference lib="node" />
declare module 'clock-mock' {
  export default class Clock {
    _now: number
    timers: { [k: number]: Node.Timer }
    Date: MockDate

    now(): number
    travel(to: number): void
    advance(n: number): void
    setTimeout(f: (..._: any[]) => any, n: number = 1): Timer
    clearTimeout(t: Timer): void
    setInterval(f: (..._: any[]) => any, n: number = 1): Timer
    clearInterval(t: Timer): void
    hrtime(s = ([number, number] = [0, 0])): [number, number]
    hrtimeBigint(): BigInt
    enter(): ()=>void
    exit(): void
    static Timer(): typeof Timer
  }

  export class Timer {
    f: (..._: any[]) => any
    w: number
    reffed: boolean

    constructor(clock: Clock, w: number, f: (..._: any[]) => any)
    unref():void
    ref(): void
    clear(): void
  }

  class MockDate extends Date {}
}
