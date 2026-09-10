import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SETTLE_IDLE_MS } from "./weekSnapFling"
import { attachWeekSnapSession } from "./weekSnapSession"

class ScrollContainer extends EventTarget {
  dataset: DOMStringMap = {}
  scrollTop = 0
  scrollHeight = 10000
  clientHeight = 500
  scrollTo = vi.fn((options: ScrollToOptions | number = {}, y?: number) => {
    this.scrollTop = Math.round(typeof options === "number" ? y! : options.top!)
    // Browser scroll steps run before the next rendering update's rAF callbacks.
    setTimeout(() => dispatch(this, "scroll"), 0)
  })
}

function dispatch(target: EventTarget, type: string, properties = {}) {
  const event = new Event(type, { cancelable: true })
  Object.defineProperty(event, "timeStamp", { value: performance.now() })
  Object.assign(event, properties)
  target.dispatchEvent(event)
  return event
}

describe("week snap input session", () => {
  let el: ScrollContainer
  let view: EventTarget
  let enabled: boolean
  let rowHeight: number
  let reducedMotion: boolean
  let session: ReturnType<typeof attachWeekSnapSession>
  const wheel = (properties = {}) =>
    dispatch(el, "wheel", { deltaY: 12, deltaMode: 0, ctrlKey: false, ...properties })
  const scroll = (delta = 12) => {
    el.scrollTop += delta
    dispatch(el, "scroll")
  }
  const coast = (first = 20, second = 18) => {
    vi.advanceTimersByTime(16)
    scroll(first)
    vi.advanceTimersByTime(16)
    scroll(second)
  }
  const flick = () => {
    wheel()
    scroll(140)
    coast()
  }
  const finish = () => vi.advanceTimersByTime(1600)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal("cancelAnimationFrame", clearTimeout)
    el = new ScrollContainer()
    view = new EventTarget()
    vi.stubGlobal(
      "window",
      Object.assign(view, {
        matchMedia: () => ({ matches: reducedMotion }),
      }),
    )
    enabled = true
    rowHeight = 100
    reducedMotion = false
    session = attachWeekSnapSession(el, () => ({ enabled, rowHeight }))
  })

  afterEach(() => {
    session.cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("leaves direct wheel gestures untouched, including scrollend between swipes", () => {
    for (let swipe = 0; swipe < 30; swipe++) {
      expect(wheel().defaultPrevented).toBe(false)
      scroll()
      dispatch(el, "scrollend")
      vi.advanceTimersByTime(200)
      expect(el.dataset.weekSnap).toBeUndefined()
    }
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 201)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(el.dataset.weekSnap).toBe("settle")
    finish()
    expect(el.scrollTop).toBe(400)
  })

  it("takes over on the second decelerating coast frame and predicts the landing", () => {
    wheel()
    scroll(140)
    vi.advanceTimersByTime(16)
    scroll(20)
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    scroll(18)
    expect(el.dataset.weekSnap).toBe("fling")
    expect(el.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 178, behavior: "instant" })
    vi.advanceTimersByTime(16)
    expect(el.scrollTo).toHaveBeenCalledTimes(2)
    finish()
    expect(el.scrollTop).toBe(500)
    expect(el.dataset.weekSnap).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("takes over upward flings", () => {
    el.scrollTop = 1000
    wheel({ deltaY: -12 })
    scroll(-140)
    coast(-20, -18)
    expect(el.dataset.weekSnap).toBe("fling")
    finish()
    expect(el.scrollTop).toBe(500)
  })

  it.each(["fling", "settle"])("new wheel input cancels a %s immediately", (kind) => {
    if (kind === "fling") flick()
    else {
      wheel()
      scroll()
      vi.advanceTimersByTime(SETTLE_IDLE_MS)
    }
    vi.advanceTimersByTime(16)
    expect(el.dataset.weekSnap).toBe(kind)
    const writes = el.scrollTo.mock.calls.length
    wheel()
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 1)
    expect(el.scrollTo).toHaveBeenCalledTimes(writes)
    scroll()
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
  })

  it("restarts the idle timer for wheel input even without movement", () => {
    wheel()
    scroll()
    vi.advanceTimersByTime(200)
    scroll()
    vi.advanceTimersByTime(200)
    wheel()
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 1)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(el.dataset.weekSnap).toBe("settle")
  })

  it.each(["pointer", "key"])("%s sessions only settle after release", (kind) => {
    const pointer = kind === "pointer"
    const props = pointer ? { pointerId: 1 } : { key: "PageDown" }
    dispatch(el, pointer ? "pointerdown" : "keydown", props)
    scroll(140)
    coast()
    finish()
    expect(el.scrollTo).not.toHaveBeenCalled()
    dispatch(view, pointer ? "pointerup" : "keyup", props)
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
    finish()
    expect(el.scrollTop).toBe(200)
  })

  it("does not take over mouse acceleration, even when its tail decelerates", () => {
    wheel()
    scroll(140)
    coast(5, 10)
    coast(8, 6)
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
  })

  it("does not take over line-mode mouse wheel events", () => {
    wheel({ deltaMode: 1 })
    scroll(140)
    coast()
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
  })

  it("does not reverse a tiny fling at takeover", () => {
    wheel()
    scroll(115)
    coast(2, 1)
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
    finish()
    expect(el.scrollTop).toBe(100)
  })

  it("ignores programmatic scrolling and cancels the session for navigation", () => {
    scroll()
    session.pause()
    scroll()
    finish()
    expect(el.scrollTo).not.toHaveBeenCalled()
    flick()
    session.cancel()
    const writes = el.scrollTo.mock.calls.length
    scroll()
    finish()
    expect(el.scrollTo).toHaveBeenCalledTimes(writes)
    expect(el.dataset.weekSnap).toBeUndefined()
  })

  it.each(["disabled", "reduced motion", "invalid height"])(
    "leaves native motion alone when %s",
    (reason) => {
      wheel()
      scroll(140)
      if (reason === "disabled") enabled = false
      if (reason === "reduced motion") reducedMotion = true
      if (reason === "invalid height") rowHeight = 0
      coast()
      expect(el.scrollTo).not.toHaveBeenCalled()
      finish()
      expect(el.scrollTo).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("ignores geometry correction scrolls until rAF and re-settles an interrupted fling", () => {
    flick()
    vi.advanceTimersByTime(16)
    session.pause()
    const writes = el.scrollTo.mock.calls.length
    el.scrollTop = 2190
    dispatch(el, "scroll")
    coast(0, 0)
    expect(el.scrollTo).toHaveBeenCalledTimes(writes)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(SETTLE_IDLE_MS)
    expect(el.dataset.weekSnap).toBe("settle")
    finish()
    expect(el.scrollTop).toBe(2200)
  })

  it("does not delay settling for the suspended correction event", () => {
    wheel()
    scroll()
    session.pause()
    vi.advanceTimersByTime(8)
    scroll(2000)
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 8)
    expect(el.dataset.weekSnap).toBe("settle")
  })

  it.each([
    [140, 100],
    [160, 200],
    [100, 100],
  ])("aligns %i to %i", (from, to) => {
    wheel()
    scroll(from)
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 1)
    expect(el.scrollTo).not.toHaveBeenCalled()
    finish()
    expect(el.scrollTop).toBe(to)
    expect(el.dataset.weekSnap).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("uses the latest row height and clamps the scroll range", () => {
    wheel()
    scroll(1392)
    rowHeight = 120
    finish()
    expect(el.scrollTop).toBe(1440)
    wheel()
    el.scrollHeight = 1475
    rowHeight = 100
    el.scrollTop = 960
    dispatch(el, "scroll")
    finish()
    expect(el.scrollTop).toBe(975)
  })

  it.each(["cancel", "cleanup", "blur"])("%s removes pending frames and timers", (action) => {
    flick()
    vi.advanceTimersByTime(1) // Flush the browser's already-queued scroll event.
    if (action === "blur") dispatch(view, "blur")
    else session[action as "cancel" | "cleanup"]()
    expect(vi.getTimerCount()).toBe(0)
    expect(el.dataset.weekSnap).toBeUndefined()
    const writes = el.scrollTo.mock.calls.length
    finish()
    expect(el.scrollTo).toHaveBeenCalledTimes(writes)
  })

  it("cleanup removes listeners, the idle timer, and the geometry resume frame", () => {
    wheel()
    scroll()
    session.pause()
    session.cleanup()
    wheel()
    scroll()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("ignores zoom, horizontal wheel input, and unrelated keys", () => {
    wheel({ ctrlKey: true })
    wheel({ deltaY: 0 })
    dispatch(el, "keydown", { key: "t" })
    scroll()
    finish()
    expect(el.scrollTo).not.toHaveBeenCalled()
  })
})
