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
    for (const line of [...lines, idle]) line.hidden = true

    for (const line of lines) {
      const input = line.dataset.termInput
      if (input === undefined) {
        await wait(Number(line.dataset.delay ?? 40))
        line.hidden = false
        continue
      }
      const text = $(line, "[data-term-text]")
      text.textContent = ""
      line.append(cursor)
      line.hidden = false
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
  },
}

// The provider buttons come in, then the pointer runs down the list.
const providers: Scene = {
  async play(root, wait) {
    const buttons = $$(root, "[data-provider]")
    for (const button of buttons) {
      button.removeAttribute("data-hover")
      button.style.opacity = "0"
    }
    await wait(300)
    for (const button of buttons) {
      button.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 250, easing: "ease-out" },
      )
      button.style.opacity = ""
      await wait(90)
    }
    await wait(900)
    for (const button of buttons) {
      button.toggleAttribute("data-hover", true)
      await wait(800)
      button.removeAttribute("data-hover")
    }
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

// Vim keys move the minical's selected day. Ends where the markup starts.
const KEYSTROKES: { key: string; label: string; days: number | null }[] = [
  { key: "l", label: "Next day", days: 1 },
  { key: "j", label: "Next week", days: 7 },
  { key: "h", label: "Previous day", days: -1 },
  { key: "k", label: "Previous week", days: -7 },
  { key: "t", label: "Go to today", days: null },
  { key: "j", label: "Next week", days: 7 },
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
  async play(root, wait) {
    const caption = $(root, "[data-keystroke]")
    const key = $(root, "[data-keystroke-key]")
    const label = $(root, "[data-keystroke-label]")
    let date = TODAY
    selectDay(root, date)
    caption.style.opacity = "0"
    await wait(900)

    for (const stroke of KEYSTROKES) {
      key.textContent = stroke.key.toUpperCase()
      label.textContent = stroke.label
      caption.style.opacity = ""
      key.animate([{ transform: "translateY(2px)" }, { transform: "none" }], { duration: 150 })
      date = stroke.days === null ? TODAY : addDays(date, stroke.days)
      selectDay(root, date)
      await wait(1000)
    }
  },
}

// Cycles the app window through the built-in themes, back round to ren, and
// tints the stage with each theme's primary color.
interface Theme {
  name: string
  vars: Record<string, string>
}

const themesOf = (root: HTMLElement) =>
  JSON.parse($(root, "[data-themes]").dataset.themes!) as Theme[]

function showTheme(root: HTMLElement, theme: Theme) {
  const scope = $(root, "[data-app-window]")
  applyVars(scope, theme.vars)
  $(root, "[data-theme-name]").textContent = theme.name
  return getComputedStyle(scope).getPropertyValue("--primary").trim()
}

const themes: Scene = {
  rest(root) {
    showTheme(root, themesOf(root)[0])
  },

  async play(root, wait) {
    const [first, ...rest] = themesOf(root)
    const stage = root.closest<HTMLElement>("[data-feature-stage]")
    showTheme(root, first)
    await wait(600)
    for (const theme of [...rest, first]) {
      stage?.style.setProperty("--stage", showTheme(root, theme))
      await wait(1100)
    }
    stage?.style.removeProperty("--stage")
  },
}

function applyVars(el: HTMLElement, vars: Record<string, string>) {
  for (const prop of [...el.style]) if (prop.startsWith("--")) el.style.removeProperty(prop)
  for (const [prop, value] of Object.entries(vars)) el.style.setProperty(prop, value)
}

export const SCENES: Record<string, Scene> = { terminal, providers, compose, keyboard, themes }
