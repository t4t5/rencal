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

// Events typed into the compose box one after another. Each step is what the
// app's parser (src/lib/magic-parser.ts) makes of the text at that pause.
const COMPOSE_EXAMPLES: { text: string; parsed: Partial<Draft> }[][] = [
  [
    { text: "Lunch with Sarah ", parsed: { summary: "Lunch with Sarah" } },
    {
      text: "tomorrow",
      parsed: { date: addDays(TODAY, 1), allDay: true, phrases: ["tomorrow"] },
    },
    {
      text: " at 1pm",
      parsed: { start: "13:00", end: "14:00", allDay: false, phrases: ["tomorrow at 1pm"] },
    },
  ],
  [
    { text: "Drinks with Tom ", parsed: { summary: "Drinks with Tom" } },
    {
      text: "on Saturday at 7pm",
      parsed: {
        date: addDays(TODAY, 2),
        start: "19:00",
        end: "20:00",
        allDay: false,
        phrases: ["on Saturday at 7pm"],
      },
    },
    {
      text: " at The Crown",
      parsed: { location: "The Crown", phrases: ["on Saturday at 7pm", "The Crown"] },
    },
  ],
  [
    { text: "Standup ", parsed: { summary: "Standup" } },
    { text: "every weekday", parsed: { repeat: "every weekday", phrases: ["every weekday"] } },
    {
      text: " at 9:30am",
      parsed: { start: "09:30", end: "10:30", phrases: ["every weekday", "at 9:30am"] },
    },
  ],
]
const COMPOSE_DEFAULT: Draft = {
  summary: "",
  date: TODAY,
  start: "10:00",
  end: "11:00",
  allDay: false,
}

// The app parses 300ms after the last keystroke.
const PARSE_DELAY_MS = 300
// FlyAnimation.tsx: the card shrinks into the minical, below the compose box.
const FLIGHT_MS = 650
const COLLAPSE_MS = 200

function renderCompose(root: HTMLElement, text: string, draft: Draft) {
  const scope = $(root, "[data-closeup]")
  renderComposeInput(scope, text, draft.phrases)
  scope.toggleAttribute("data-typing", text.length > 0)
  $(scope, "[data-compose-drawer]").toggleAttribute("data-open", text.length > 0)
  fillForm($(scope, "[data-compose-card]"), draft, DEFAULT_CALENDAR)
}

const cancelFlight = (root: HTMLElement) =>
  $(root, "[data-compose-card]")
    .getAnimations()
    .forEach((animation) => animation.cancel())

const compose: Scene = {
  rest(root) {
    cancelFlight(root)
    const [example] = COMPOSE_EXAMPLES
    const text = example.map((step) => step.text).join("")
    const draft = Object.assign({ ...COMPOSE_DEFAULT }, ...example.map((step) => step.parsed))
    renderCompose(root, text, draft)
  },

  async play(root, wait) {
    cancelFlight(root)
    renderCompose(root, "", COMPOSE_DEFAULT)
    await wait(800)

    for (;;) {
      for (const example of COMPOSE_EXAMPLES) {
        let text = ""
        let draft = { ...COMPOSE_DEFAULT }
        // Until the first parse, the title is the text as typed; after that it
        // only changes when the parser runs (as in the app).
        let parsed = false
        for (const step of example) {
          for (const key of step.text) {
            text += key
            if (!parsed) draft.summary = text
            renderCompose(root, text, draft)
            await wait(60 + Math.random() * 40)
          }
          await wait(PARSE_DELAY_MS)
          draft = { ...draft, ...step.parsed }
          parsed = true
          renderCompose(root, text, draft)
          await wait(400)
        }
        await wait(900)

        // Enter: the card flies off while the input keeps the text, minus its clear button.
        const card = $(root, "[data-compose-card]")
        card.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: "translateY(160px) scale(0.05)", opacity: 0 },
          ],
          {
            duration: FLIGHT_MS,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "forwards",
          },
        )
        $(root, "[data-closeup]").removeAttribute("data-typing")
        await wait(FLIGHT_MS)
        renderCompose(root, "", COMPOSE_DEFAULT)
        await wait(COLLAPSE_MS)
        cancelFlight(root)
        await wait(250)
      }
    }
  },
}

// Vim keys move the minical's selected day in quick bursts, pausing between
// them. The bursts stay within the card's five weeks and loop back to today, so
// the scene can repeat without a jump.
const KEY_DAYS: Record<string, number> = { h: -1, j: 7, k: -7, l: 1 }
const BURSTS = ["klkl", "jhjhj", "lkl", "jhkh"]

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
      for (const burst of BURSTS) {
        for (const key of burst) {
          const keycap = $(root, `[data-keycap="${key}"]`)
          keycap.toggleAttribute("data-pressed", true)
          date = addDays(date, KEY_DAYS[key])
          selectDay(root, date)
          await wait(55 + Math.random() * 20)
          keycap.removeAttribute("data-pressed")
          await wait(45 + Math.random() * 40)
        }
        await wait(900 + Math.random() * 500)
      }
    }
  },
}

export const SCENES: Record<string, Scene> = { terminal, compose, keyboard }
