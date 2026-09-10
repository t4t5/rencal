import { describe, expect, it, vi } from "vitest"

import {
  classifyGesture,
  decayRate,
  pickFlingTarget,
  pickSnapTarget,
  predictFlingEnd,
  startSnapFling,
} from "./weekSnapFling"

function setup(from = 140, velocity = 0, to = 200) {
  let now = 0
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const clock = {
    now: () => now,
    requestFrame: (callback: FrameRequestCallback) => {
      frames.set(++id, callback)
      return id
    },
    cancelFrame: (frame: number) => {
      frames.delete(frame)
    },
  }
  const offsets: number[] = []
  const el = {
    scrollTo: vi.fn((options: ScrollToOptions | number = {}, y?: number) => {
      offsets.push(typeof options === "number" ? y! : options.top!)
    }),
  }
  const onDone = vi.fn()
  const animation = startSnapFling(el, { from, velocity, to, onDone }, clock)
  const step = (ms: number) => {
    now += ms
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(now))
  }
  return { animation, step, offsets, onDone, frames }
}

describe("week snap fling physics", () => {
  it("does not rebind browser frame methods to the clock object", () => {
    const requireWindowReceiver = (receiver: unknown) => {
      if (receiver !== undefined && receiver !== globalThis) {
        throw new TypeError("Frame API called on an object that does not implement Window")
      }
    }
    const request = vi.fn(function (this: unknown, _callback: FrameRequestCallback) {
      requireWindowReceiver(this)
      return 123
    })
    const cancel = vi.fn(function (this: unknown, _frame: number) {
      requireWindowReceiver(this)
    })
    vi.stubGlobal("requestAnimationFrame", request)
    vi.stubGlobal("cancelAnimationFrame", cancel)
    try {
      const animation = startSnapFling(
        { scrollTo: vi.fn() },
        { from: 140, velocity: 0, to: 200, onDone: vi.fn() },
      )
      expect(request).toHaveBeenCalledTimes(1)
      animation.cancel()
      expect(cancel).toHaveBeenCalledExactlyOnceWith(123)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    [100, 400, 1000, 200],
    [100, -800, 1000, 0],
    [900, 800, 1000, 1000],
    [100, 0, 1000, 100],
    [100, 100, -10, 0],
  ])("predicts and clamps the native end from %i at %i px/s", (from, velocity, max, end) => {
    expect(predictFlingEnd(from, velocity, max)).toBe(end)
  })

  it.each([
    [140, 100, 1000, 100],
    [150, 100, 1000, 200],
    [160, 100, 1000, 200],
    [-60, 100, 1000, 0],
    [990, 100, 975, 975],
    [100, 100, -20, 0],
    [187, 125.5, 1000, 125.5],
  ])("picks a clamped week boundary for %i", (offset, height, max, target) => {
    expect(pickSnapTarget(offset, height, max)).toBe(target)
  })

  it("matches velocity where possible and bounds the decay rate", () => {
    expect(decayRate(600, 100)).toBe(6)
    expect(decayRate(-600, -100)).toBe(6)
    expect(decayRate(0, 100)).toBe(4)
    expect(decayRate(1, 100)).toBe(4)
    expect(decayRate(600, 1)).toBe(30)
    expect(decayRate(0, 0)).toBe(4)
  })

  it.each([
    [118, 62.5, 100, 1000, 200], // Predicted end just past a crossed line.
    [99.5, 1, 100, 1000, 200], // A subpixel gap counts as reached.
    [178, 1125, 100, 1000, 500],
    [282, -62.5, 100, 1000, 200],
    [200.5, -1, 100, 1000, 100],
    [822, -1125, 100, 1000, 500],
    [130, 40, 125.5, 1000, 251],
    [245, -40, 125.5, 1000, 125.5],
    [960, 100, 100, 975, 975],
    [975, 100, 100, 975, undefined],
    [974.5, 100, 100, 975, undefined],
    [0, -100, 100, 975, undefined],
    [100, 0, 100, 1000, undefined],
  ])("picks only targets ahead of %f at %f px/s", (from, velocity, height, max, target) => {
    expect(pickFlingTarget(from, velocity, height, max)).toBe(target)
  })

  it.each([
    [[], false],
    [[120], false],
    [[12, 18], false],
    [[12, 18, 12], true],
    [[-12, -18, -12], true],
    [[0.25, 0.5, 0.25], true],
    [[120, 120, 120, 120], false],
    [[12, -12, 12], false],
  ])("classifies the proposed wheel signature %j as precise=%s", (deltas, precise) => {
    expect(classifyGesture(deltas.map((deltaY, i) => ({ t: i * 16, deltaY })))).toBe(precise)
  })

  it("classifies only events in the 150 ms capture window, including its boundary", () => {
    const events = [
      { t: 0, deltaY: 12 },
      { t: 75, deltaY: 18 },
      { t: 150, deltaY: 12 },
    ]
    expect(classifyGesture(events)).toBe(true)
    events[2].t = 151
    expect(classifyGesture(events)).toBe(false)
  })

  it.each([1, 2])("excludes explicit wheel delta mode %i", (deltaMode) => {
    expect(classifyGesture([12, 18, 12].map((deltaY, t) => ({ t, deltaY, deltaMode })))).toBe(false)
  })

  it.each([
    [140, 0, 200],
    [240, -600, 100],
  ])("lands exactly and monotonically from %i", (from, velocity, to) => {
    const { animation, step, offsets, onDone, frames } = setup(from, velocity, to)
    for (let i = 0; i < 200; i++) step(8)
    expect(offsets.at(-1)).toBe(to)
    expect(animation.lastWritten()).toBe(to)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    offsets.forEach((offset, i) => {
      expect((offset - (offsets[i - 1] ?? from)) * Math.sign(to - from)).toBeGreaterThanOrEqual(0)
      expect(offset).toBeGreaterThanOrEqual(Math.min(from, to))
      expect(offset).toBeLessThanOrEqual(Math.max(from, to))
    })
  })

  it("uses elapsed time, independent of frame rate", () => {
    const fast = setup()
    const slow = setup()
    for (let i = 0; i < 50; i++) {
      fast.step(8)
      fast.step(8)
      slow.step(16)
      expect(fast.animation.lastWritten()).toBe(slow.animation.lastWritten())
    }
  })

  it("keeps fractional positions independent of integer scrollTop readback", () => {
    const { animation, step, offsets } = setup(140.25, 0, 200.5)
    step(100)
    expect(animation.lastWritten()).not.toBe(Math.round(animation.lastWritten()))
    step(300)
    expect(offsets.at(-1)).toBe(200.5)
  })

  it("reaches the target at the finite landing time", () => {
    const { step, offsets, onDone } = setup(0, 600, 150)
    const duration = (Math.log(600 / 60) / 4) * 1000
    step(duration - 1)
    expect(offsets.at(-1)).toBeLessThan(150)
    expect(onDone).not.toHaveBeenCalled()
    step(1)
    expect(offsets.at(-1)).toBe(150)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it.each([150, -150])("moves at least one pixel per full 60 Hz frame toward %i", (to) => {
    const { animation, step, offsets, onDone } = setup(0, 0, to)
    while (!onDone.mock.calls.length) {
      const previous = animation.lastWritten()
      step(1000 / 60)
      // The last frame may span only the fraction remaining before the landing time.
      if (!onDone.mock.calls.length)
        expect(Math.abs(offsets.at(-1)! - previous)).toBeGreaterThanOrEqual(1)
    }
  })

  it.each([0, 1, -1, 15])("lands short corrections to %i without dividing by zero", (to) => {
    const { step, offsets, onDone } = setup(0, 0, to)
    step(16)
    expect(offsets).toEqual([to])
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("cancels all future writes and completion", () => {
    const { animation, step, offsets, onDone, frames } = setup()
    step(16)
    animation.cancel()
    step(2000)
    expect(offsets).toHaveLength(1)
    expect(frames.size).toBe(0)
    expect(onDone).not.toHaveBeenCalled()
  })

  it("caps a very long tail at 1500 ms", () => {
    const { step, offsets, onDone } = setup(0, 0, 10000)
    step(1499)
    expect(offsets.at(-1)).toBeLessThan(10000)
    expect(onDone).not.toHaveBeenCalled()
    step(1)
    expect(offsets.at(-1)).toBe(10000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
