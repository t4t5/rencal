import { describe, expect, it } from "@/lib/testing/vitest"

import { createWheelSnap, GESTURE_IDLE_MS, NOTCH_RUN_MS } from "./wheel-snap"

const ROW = 100

function setup(start = 1000) {
  let clock = 0
  let offset = start
  const timers: { at: number; run: () => void }[] = []
  const moves: { y: number; animated: boolean }[] = []
  const snap = createWheelSnap({
    offset: () => offset,
    rowHeight: () => ROW,
    maxOffset: () => 5000,
    scrollTo(y, animated) {
      moves.push({ y, animated })
      offset = y
    },
    now: () => clock,
    setTimer(run, ms) {
      const timer = { at: clock + ms, run }
      timers.push(timer)
      return () => timers.splice(timers.indexOf(timer) >>> 0, 1)
    },
    reduceMotion: () => false,
  })
  const advance = (ms: number) => {
    clock += ms
    for (const timer of timers.filter(({ at }) => at <= clock)) {
      timers.splice(timers.indexOf(timer), 1)
      timer.run()
    }
  }
  return { snap, moves, advance, offset: () => offset }
}

describe("wheel snap", () => {
  it("moves one row a notch, eased", () => {
    const { snap, moves } = setup()
    snap.wheel({ delta: { y: 1 }, deltaMode: "lines" })
    expect(moves).toEqual([{ y: 1100, animated: true }])
  })

  it("adds up a run of notches before the first lands", () => {
    const { snap, moves, advance } = setup()
    snap.wheel({ delta: { y: 1 }, deltaMode: "lines" })
    advance(30)
    snap.wheel({ delta: { y: 1 }, deltaMode: "lines" })
    advance(30)
    snap.wheel({ delta: { y: -1 }, deltaMode: "lines" })
    expect(moves.map(({ y }) => y)).toEqual([1100, 1200, 1100])
  })

  it("starts a later notch from where scrolling is", () => {
    const { snap, moves, advance } = setup(1040)
    snap.wheel({ delta: { y: 1 }, deltaMode: "lines" })
    advance(NOTCH_RUN_MS + 1)
    snap.wheel({ delta: { y: 1 }, deltaMode: "lines" })
    expect(moves.map(({ y }) => y)).toEqual([1100, 1200])
  })

  it("follows a touchpad, then settles a slow one on the nearest row", () => {
    const { snap, moves, advance, offset } = setup()
    for (const dy of [2, 2, 2]) {
      snap.wheel({ delta: { y: dy }, deltaMode: "points" })
      advance(40)
    }
    expect(moves.slice(0, 3)).toEqual([
      { y: 1002, animated: false },
      { y: 1004, animated: false },
      { y: 1006, animated: false },
    ])
    advance(GESTURE_IDLE_MS)
    expect(offset()).toBe(1000)
  })

  it("glides a fast touchpad flick past the next row", () => {
    const { snap, advance, offset } = setup()
    for (let i = 0; i < 5; i++) {
      snap.wheel({ delta: { y: 30 }, deltaMode: "points" })
      advance(10)
    }
    advance(GESTURE_IDLE_MS)
    expect(offset()).toBeGreaterThan(1200)
    expect(offset() % ROW).toBe(0)
  })

  it("settles a slow drag past half a row on the next row", () => {
    const { snap, advance, offset } = setup()
    for (let i = 0; i < 30; i++) {
      snap.wheel({ delta: { y: 2 }, deltaMode: "points" })
      advance(40)
    }
    advance(GESTURE_IDLE_MS)
    expect(offset()).toBe(1100)
  })

  it("never scrolls past the ends", () => {
    const { snap, offset } = setup(0)
    snap.wheel({ delta: { y: -1 }, deltaMode: "lines" })
    expect(offset()).toBe(0)
  })
})
