// Plays the landing-page demo on an AppWindow: step through a few days, open
// two events, then type a new event into the compose box, as in the app.
// Timings follow the original demo video; app behaviour (debounced parsing,
// the fly-to-minical confirmation) follows the app's source.
import { fillForm, renderComposeInput, type Draft } from "./compose"
import { DEFAULT_CALENDAR, TODAY, type CalendarId } from "./data"

const START_DATE = "2026-06-10"
const LOOP_MS = 16700

// The app parses compose text 300ms after the last keystroke.
const PARSE_DELAY_MS = 300
const KEYSTROKE_MS = 150
// FlyAnimation.tsx: flight, then a buffer before the compose card collapses.
const FLIGHT_MS = 650
const FLY_HOLD_MS = FLIGHT_MS + 300
const COLLAPSE_MS = 200
const POPOVER_EXIT_MS = 150

// What the app's parser makes of each pause in typing "Dinner on Saturday at 8pm".
const TYPING: { at: number; text: string; parsed: Partial<Draft> }[] = [
  { at: 6250, text: "Dinner on ", parsed: { summary: "Dinner on" } },
  {
    at: 8300,
    text: "Saturday a",
    parsed: { summary: "Dinner a", date: "2026-06-27", allDay: true, phrases: ["on Saturday"] },
  },
  {
    at: 10600,
    text: "t 8pm",
    parsed: {
      summary: "Dinner",
      date: "2026-06-27",
      start: "20:00",
      end: "21:00",
      allDay: false,
      phrases: ["on Saturday at 8pm"],
    },
  },
]

const DEFAULT_DRAFT: Draft = {
  summary: "",
  date: TODAY,
  start: "10:00",
  end: "11:00",
  allDay: false,
}

export function playDemo(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = root) =>
    scope.querySelector<T & HTMLElement>(selector)!
  const $$ = (selector: string, scope: ParentNode = root) => [
    ...scope.querySelectorAll<HTMLElement>(selector),
  ]

  const agenda = $("[data-agenda-scroll]")
  const popover = $("[data-event-popover]")
  const composePlaceholder = $("[data-compose-placeholder]")
  const drawer = $("[data-compose-drawer]")
  const card = $("[data-compose-card]")
  const created = $$("[data-created]")

  // Everything is laid out at the window's logical size, then scaled.
  const scale = () => root.getBoundingClientRect().width / root.offsetWidth
  const localRect = (el: Element) => {
    const origin = root.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const s = scale()
    return {
      left: (rect.left - origin.left) / s,
      top: (rect.top - origin.top) / s,
      width: rect.width / s,
      height: rect.height / s,
    }
  }

  const toggle = (el: Element, attr: string, on: boolean) => el.toggleAttribute(attr, on)

  function setActiveDate(date: string, behavior: ScrollBehavior = "smooth") {
    root.dataset.activeDate = date
    for (const el of $$("[data-slot=calendar-day], [data-slot^=month-day]")) {
      toggle(el, "data-selected", el.dataset.dateKey === date)
    }
    for (const week of $$("[data-minical-week]")) {
      toggle(week, "data-selected-week", !!week.querySelector(`[data-date-key="${date}"]`))
    }
    for (const section of $$("[data-slot=agenda-day]")) {
      toggle(section, "data-active", section.dataset.date === date)
    }
    selectEvent(null)

    const section = $(`[data-slot=agenda-day][data-date="${date}"]`, agenda)
    if (section) {
      const top = localRect(section).top - localRect(agenda).top + agenda.scrollTop
      agenda.scrollTo({ top, behavior })
    }
  }

  function selectEvent(id: string | null) {
    for (const el of $$("[data-event-id]")) toggle(el, "data-selected", el.dataset.eventId === id)
  }

  function openPopover(id: string) {
    const item = $(`[data-slot=agenda-day] [data-event-id="${id}"]`)
    const data = item.dataset
    fillForm(
      popover,
      {
        summary: data.title ?? "",
        date: data.date ?? TODAY,
        start: data.start ?? "",
        end: data.end ?? "",
        allDay: false,
        location: data.location,
      },
      data.calendar as CalendarId,
    )
    popover.hidden = false
    popover.dataset.state = "open"
  }

  async function closePopover() {
    popover.dataset.state = "closed"
    await sleep(POPOVER_EXIT_MS)
    popover.hidden = true
  }

  let draft: Draft = { ...DEFAULT_DRAFT }
  let text = ""
  let hasParsedDate = false

  function renderCompose() {
    const typing = text.length > 0
    renderComposeInput(root, text, draft.phrases)
    toggle(root, "data-typing", typing)
    toggle(root, "data-drafting", typing)
    toggle(drawer, "data-open", typing)

    fillForm(card, draft, DEFAULT_CALENDAR)

    for (const el of $$("[data-draft-chip], [data-draft-bar], [data-draft-spacer]"))
      el.hidden = true
    if (!typing) return
    const date = draft.date
    if (draft.allDay) {
      $(`[data-draft-bar="${date}"]`).hidden = false
      $(`[data-draft-spacer="${date}"]`).hidden = false
    } else {
      const chip = $(`[data-draft-chip="${date}"]`)
      chip.hidden = false
      $("[data-draft-time]", chip).textContent = draft.start
    }
    for (const title of $$("[data-draft-title]")) title.textContent = draft.summary
  }

  function typeKey(key: string) {
    text += key
    if (!hasParsedDate) draft.summary = text
    renderCompose()
  }

  function parse(parsed: Partial<Draft>) {
    draft = { ...draft, ...parsed }
    if (parsed.date) {
      hasParsedDate = true
      if (parsed.date !== root.dataset.activeDate) setActiveDate(parsed.date)
    }
    renderCompose()
  }

  // A translucent copy of the compose card shrinks into the event's minical day.
  function flyToMinical(date: string) {
    const target = $(`[data-slot=calendar-day][data-date-key="${date}"]`)
    const from = localRect(card)
    const to = localRect(target)
    const clone = card.cloneNode(true) as HTMLElement
    Object.assign(clone.style, {
      position: "absolute",
      top: `${from.top}px`,
      left: `${from.left}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
      transformOrigin: "center center",
    })
    root.appendChild(clone)
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const s = Math.max(to.width / from.width, 0.05)
    clone
      .animate(
        [
          { transform: "none", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
      )
      .finished.then(() => clone.remove())
    card.style.opacity = "0"
  }

  async function submit() {
    const date = draft.date
    for (const el of created) {
      el.hidden = false
      el.removeAttribute("data-created")
    }
    flyToMinical(date)
    for (const el of $$("[data-draft-chip], [data-draft-bar], [data-draft-spacer]"))
      el.hidden = true
    toggle(root, "data-drafting", false)
    // The input keeps showing the submitted text during the flight, minus its clear button.
    toggle(root, "data-typing", false)
    setActiveDate(TODAY, "instant")

    await sleep(FLY_HOLD_MS)
    closeCompose()
    await sleep(COLLAPSE_MS)
    card.style.opacity = ""
  }

  function closeCompose() {
    text = ""
    draft = { ...DEFAULT_DRAFT }
    hasParsedDate = false
    renderCompose()
    toggle(root, "data-composing", false)
    composePlaceholder.hidden = true
  }

  function reset() {
    for (const el of created) {
      el.hidden = el.dataset.slot !== "agenda-day"
      el.setAttribute("data-created", "")
    }
    closeCompose()
    popover.hidden = true
    setActiveDate(START_DATE, "instant")
  }

  async function loop() {
    const t0 = performance.now()
    const at = (ms: number) => sleep(ms - (performance.now() - t0))

    reset()
    await at(650)
    setActiveDate("2026-06-17")
    await at(850)
    setActiveDate("2026-06-24")
    await at(1100)
    setActiveDate(TODAY)

    const backend = $(`[data-slot=agenda-day][data-date="${TODAY}"] [data-event-id]`).dataset
      .eventId!
    await at(1550)
    selectEvent(backend)
    await at(2000)
    openPopover(backend)
    await at(2800)
    await closePopover()

    const tomorrow = "2026-06-26"
    await at(3050)
    setActiveDate(tomorrow)
    const standup = $(`[data-slot=agenda-day][data-date="${tomorrow}"] [data-event-id]`).dataset
      .eventId!
    await at(3400)
    selectEvent(standup)
    await at(3750)
    openPopover(standup)
    await at(4650)
    await closePopover()

    await at(5550)
    selectEvent(null)
    toggle(root, "data-composing", true)
    renderCompose()
    for (const step of TYPING) {
      await at(step.at)
      for (const key of step.text) {
        typeKey(key)
        await sleep(KEYSTROKE_MS)
      }
      await sleep(PARSE_DELAY_MS - KEYSTROKE_MS)
      parse(step.parsed)
    }

    await at(12850)
    await submit()
    await at(LOOP_MS)
  }

  // Run only while on screen, and not at all for reduced motion.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return

  let visible = false
  let wake: (() => void) | null = null
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) wake?.()
  }).observe(root)

  void (async () => {
    for (;;) {
      if (!visible || document.hidden) {
        await new Promise<void>((resolve) => (wake = resolve))
        continue
      }
      await loop()
    }
  })()
  document.addEventListener("visibilitychange", () => !document.hidden && visible && wake?.())
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
