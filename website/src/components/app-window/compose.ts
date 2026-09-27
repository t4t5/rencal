// The compose box's client-side rendering, shared by the hero demo and the
// natural-input close-up: fill the event form from a parsed draft, and outline
// the phrases the parser recognised in the input.
import { CALENDARS, formDate, type CalendarId } from "./data"

export interface Draft {
  summary: string
  date: string
  start: string
  end: string
  allDay: boolean
  location?: string
  /** The repeat select's label, e.g. "every weekday". */
  repeat?: string
  /** Text the parser recognised, in input order, outlined in the compose input. */
  phrases?: string[]
}

export function fillForm(form: HTMLElement, draft: Draft, calendar: CalendarId) {
  const field = (name: string) => form.querySelector<HTMLElement>(`[data-field="${name}"]`)!
  field("title").textContent = draft.summary
  // Empty fields show their placeholder.
  for (const [name, value, placeholder] of [
    ["location", draft.location, "Location"],
    ["repeat", draft.repeat, "Repeat"],
  ] as const) {
    field(name).textContent = value ?? placeholder
    field(name).toggleAttribute("data-empty", !value)
  }
  field("start").textContent = draft.start
  field("end").textContent = draft.end
  // All-day drafts keep the last times, disabled (the row and its inputs both fade).
  for (const name of ["times", "start", "end"]) {
    field(name).style.opacity = draft.allDay ? "0.5" : ""
  }
  field("date-start").textContent = formDate(draft.date)
  field("date-end").textContent = formDate(draft.date)
  field("date-end-cell").hidden = !draft.allDay
  field("timezone").hidden = draft.allDay
  field("all-day").toggleAttribute("data-checked", draft.allDay)
  field("all-day-label").style.color = draft.allDay ? "var(--foreground)" : ""
  field("calendar").textContent = CALENDARS[calendar].name
  field("calendar-color").style.backgroundColor = `var(--event-color, ${CALENDARS[calendar].color})`
}

/** Sets the compose input's text and outlines each of `phrases` within it. */
export function renderComposeInput(root: HTMLElement, text: string, phrases: string[] = []) {
  const $ = (selector: string) => root.querySelector<HTMLElement>(selector)
  const measure = $("[data-compose-measure]")!

  $("[data-compose-text]")!.textContent = text
  const placeholder = $("[data-compose-placeholder]")
  if (placeholder) placeholder.hidden = text.length > 0

  const highlights = root.querySelectorAll<HTMLElement>("[data-compose-highlight]")
  let from = 0
  highlights.forEach((highlight, i) => {
    const phrase = phrases.at(i)
    const index = phrase ? text.indexOf(phrase, from) : -1
    highlight.hidden = index < 0
    if (!phrase || index < 0) return
    measure.textContent = text.slice(0, index)
    const left = measure.offsetWidth
    measure.textContent = phrase
    highlight.style.left = `${8 + left}px`
    highlight.style.width = `${measure.offsetWidth}px`
    from = index + phrase.length
  })
}
