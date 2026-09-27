// Animations for the feature close-ups, keyed by their `data-scene`. `play`
// resets the close-up and animates it to its resting state; `rest` puts it in
// that state without motion, for markup that needs script to fill it in.
import { fillForm, renderComposeInput, type Draft } from "../../app-window/compose"
import { DEFAULT_CALENDAR, TODAY, addDays } from "../../app-window/data"

/** Resolves after `ms`; rejects once the scene is interrupted. */
export type Wait = (ms: number) => Promise<void>

export interface Scene {
  rest?: (root: HTMLElement) => void
  play: (root: HTMLElement, wait: Wait) => Promise<void>
}

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector<T>(selector)!
const $$ = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)]

// Types commands, then prints their output a line at a time.
const terminal: Scene = {
  async play(root, wait) {
    const lines = $$(root, "[data-term-input], [data-term-output]")
    const idle = $(root, "[data-term-idle]")
    const cursor = $(root, "[data-term-cursor]")
    const screen = $(root, "[data-term-screen]")
    const scroll = () => (screen.scrollTop = screen.scrollHeight)
    for (const line of [...lines, idle]) line.hidden = true
    scroll()

    for (const line of lines) {
      const input = line.dataset.termInput
      if (input === undefined) {
        await wait(Number(line.dataset.delay ?? 40))
        line.hidden = false
        scroll()
        continue
      }
      const text = $(line, "[data-term-text]")
      text.textContent = ""
      line.append(cursor)
      line.hidden = false
      scroll()
      await wait(500)
      for (const char of input) {
        text.textContent += char
        await wait(25 + Math.random() * 30)
      }
      await wait(300)
      cursor.remove()
    }
    idle.append(cursor)
    idle.hidden = false
    scroll()
  },
}

// What the app's parser makes of each pause in typing the event.
const COMPOSE_STEPS: { text: string; parsed: Partial<Draft> }[] = [
  { text: "Lunch with Sarah ", parsed: { summary: "Lunch with Sarah" } },
  {
    text: "tomorrow",
    parsed: { date: addDays(TODAY, 1), allDay: true, phrase: "tomorrow" },
  },
  {
    text: " at 1",
    parsed: { start: "13:00", end: "14:00", allDay: false, phrase: "tomorrow at 1" },
  },
]
const COMPOSE_DEFAULT: Draft = {
  summary: "",
  date: TODAY,
  start: "10:00",
  end: "11:00",
  allDay: false,
}

function renderCompose(root: HTMLElement, text: string, draft: Draft) {
  const scope = $(root, "[data-closeup]")
  renderComposeInput(scope, text, draft.phrase)
  scope.toggleAttribute("data-typing", text.length > 0)
  $(scope, "[data-compose-drawer]").toggleAttribute("data-open", text.length > 0)
  fillForm($(scope, "[data-compose-card]"), draft, DEFAULT_CALENDAR)
}

const compose: Scene = {
  rest(root) {
    const text = COMPOSE_STEPS.map((step) => step.text).join("")
    const draft = Object.assign({ ...COMPOSE_DEFAULT }, ...COMPOSE_STEPS.map((step) => step.parsed))
    renderCompose(root, text, draft)
  },

  async play(root, wait) {
    let text = ""
    let draft = { ...COMPOSE_DEFAULT }
    renderCompose(root, text, draft)
    await wait(800)

    // Until a date is parsed, the title is the text as typed (as in the app).
    let hasParsedDate = false
    for (const step of COMPOSE_STEPS) {
      for (const key of step.text) {
        text += key
        if (!hasParsedDate) draft.summary = text
        renderCompose(root, text, draft)
        await wait(110)
      }
      // The app parses 300ms after the last keystroke.
      await wait(300)
      draft = { ...draft, ...step.parsed }
      hasParsedDate ||= step.parsed.date !== undefined
      renderCompose(root, text, draft)
      await wait(500)
    }
  },
}

// Vim keys move the minical's selected day around a loop back to today, so
// the scene can repeat without a jump.
const KEYSTROKES: { key: string; days: number }[] = [
  { key: "k", days: -7 },
  { key: "k", days: -7 },
  { key: "l", days: 1 },
  { key: "l", days: 1 },
  { key: "j", days: 7 },
  { key: "h", days: -1 },
  { key: "j", days: 7 },
  { key: "h", days: -1 },
]

function selectDay(root: HTMLElement, date: string) {
  for (const day of $$(root, "[data-slot=calendar-day]")) {
    day.toggleAttribute("data-selected", day.dataset.dateKey === date)
  }
  for (const week of $$(root, "[data-minical-week]")) {
    week.toggleAttribute("data-selected-week", !!$(week, `[data-date-key="${date}"]`))
  }
}

const keyboard: Scene = {
  rest(root) {
    for (const keycap of $$(root, "[data-keycap]")) keycap.removeAttribute("data-pressed")
    selectDay(root, TODAY)
  },

  async play(root, wait) {
    let date = TODAY
    selectDay(root, date)
    await wait(600)

    for (;;) {
      for (const stroke of KEYSTROKES) {
        const keycap = $(root, `[data-keycap="${stroke.key}"]`)
        keycap.toggleAttribute("data-pressed", true)
        date = addDays(date, stroke.days)
        selectDay(root, date)
        await wait(160)
        keycap.removeAttribute("data-pressed")
        await wait(640)
      }
    }
  },
}

export const SCENES: Record<string, Scene> = { terminal, compose, keyboard }
