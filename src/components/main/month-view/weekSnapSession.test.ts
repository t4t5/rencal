import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { attachWeekSnapSession } from "./weekSnapSession"

class ScrollContainer extends EventTarget {
  dataset: DOMStringMap = {}
  scrollTop = 0
  scrollHeight = 10000
  clientHeight = 500
  scrollTo = vi.fn()
}

function dispatch(target: EventTarget, type: string, properties = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), properties)
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
  const wheel = () => dispatch(el, "wheel", { deltaY: 12, ctrlKey: false })
  const scroll = () => {
    el.scrollTop += 12
    dispatch(el, "scroll")
  }

  beforeEach(() => {
    vi.useFakeTimers()
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

  it("leaves a long sequence of trackpad swipes completely free", () => {
    for (let swipe = 0; swipe < 30; swipe++) {
      expect(wheel().defaultPrevented).toBe(false)
      scroll()
      // Even a browser scrollend between swipes must not turn snapping on.
      dispatch(el, "scrollend")
      vi.advanceTimersByTime(500)
      expect(el.dataset.weekSnap).toBeUndefined()
    }
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(el.dataset.weekSnap).toBe("settling")
  })

  it("waits for momentum and wheel input even without a change in scroll offset", () => {
    wheel()
    scroll()
    vi.advanceTimersByTime(600)
    scroll()
    vi.advanceTimersByTime(600)
    wheel()
    vi.advanceTimersByTime(699)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(el.dataset.weekSnap).toBe("settling")
  })

  it("releases an active snap immediately, then leaves the new gesture alone", () => {
    wheel()
    scroll()
    vi.advanceTimersByTime(700)
    expect(el.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: "smooth" })
    wheel()
    expect(el.dataset.weekSnap).toBeUndefined()
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 12, behavior: "instant" })
    wheel()
    scroll()
    expect(el.scrollTo).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(700)
    expect(el.dataset.weekSnap).toBe("settling")
  })

  it("ignores programmatic scrolling and cancels a pending snap for date navigation", () => {
    scroll()
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
    wheel()
    scroll()
    session.cancel()
    scroll()
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
  })

  it("checks current drag/navigation state at the end of a session", () => {
    wheel()
    scroll()
    enabled = false
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
  })

  it("waits for pointer release outside the grid and keyboard release", () => {
    dispatch(el, "pointerdown", { pointerId: 1 })
    scroll()
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
    dispatch(view, "pointerup", { pointerId: 1 })
    vi.advanceTimersByTime(700)
    expect(el.dataset.weekSnap).toBe("settling")
    dispatch(el, "keydown", { key: "PageDown" })
    scroll()
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
    dispatch(view, "keyup", { key: "PageDown" })
    vi.advanceTimersByTime(700)
    expect(el.dataset.weekSnap).toBe("settling")
  })

  it("preserves the session across infinite-scroll offset corrections", () => {
    wheel()
    scroll()
    vi.advanceTimersByTime(500)
    session.pause()
    el.scrollTop += 2000
    dispatch(el, "scroll")
    vi.advanceTimersByTime(699)
    expect(el.dataset.weekSnap).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(el.dataset.weekSnap).toBe("settling")
  })

  it("restores ordinary scrolling when native settling completes", () => {
    wheel()
    scroll()
    vi.advanceTimersByTime(700)
    dispatch(el, "scroll")
    dispatch(el, "scrollend")
    expect(el.dataset.weekSnap).toBeUndefined()
    expect(el.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: "smooth" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [140, 100],
    [160, 200],
  ])("smoothly aligns %i to %i", (from, to) => {
    wheel()
    el.scrollTop = from
    dispatch(el, "scroll")
    vi.advanceTimersByTime(699)
    expect(el.scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(el.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: to, behavior: "smooth" })
  })

  it("uses the latest row height and clamps to the available scroll range", () => {
    wheel()
    scroll()
    rowHeight = 120
    el.scrollTop = 1392
    vi.advanceTimersByTime(700)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1440, behavior: "smooth" })
    wheel()
    el.scrollHeight = 1475
    rowHeight = 100
    el.scrollTop = 960
    dispatch(el, "scroll")
    vi.advanceTimersByTime(700)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 975, behavior: "smooth" })
  })

  it("does not animate when reduced motion is requested", () => {
    reducedMotion = true
    wheel()
    scroll()
    vi.advanceTimersByTime(700)
    expect(el.scrollTo).not.toHaveBeenCalled()
    expect(el.dataset.weekSnap).toBeUndefined()
  })

  it("removes pending work and event listeners on cleanup", () => {
    wheel()
    scroll()
    session.cleanup()
    vi.advanceTimersByTime(1000)
    expect(el.dataset.weekSnap).toBeUndefined()
    wheel()
    scroll()
    expect(vi.getTimerCount()).toBe(0)
  })
})
