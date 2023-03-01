/// <reference lib="node" />
declare module 'clock-mock' {
  export default class Clock {
    _now: number
    timers: { [k: number]: NodeJS.Timer }
    Date: MockDate

    now(): number
    travel(to: number): void
    advance(n: number): void
    flow(n: number): Promise<void>
    setTimeout(f: (..._: any[]) => any, n?: number): Timer
    clearTimeout(t: Timer): void
    setInterval(f: (..._: any[]) => any, n?: number): Timer
    clearInterval(t: Timer): void
    hrtime(s?:[number, number]): [number, number]
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
