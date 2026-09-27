// The compose box's client-side rendering, shared by the hero demo and the
// natural-input close-up: fill the event form from a parsed draft, and outline
// the phrase the parser recognised in the input.
import { CALENDARS, formDate, type CalendarId } from "./data"

export interface Draft {
  summary: string
  date: string
  start: string
  end: string
  allDay: boolean
  /** Text the parser recognised, outlined in the compose input. */
  phrase?: string
}

export function fillForm(form: HTMLElement, draft: Draft, calendar: CalendarId, location?: string) {
  const field = (name: string) => form.querySelector<HTMLElement>(`[data-field="${name}"]`)!
  field("title").textContent = draft.summary
  const locationField = field("location")
  locationField.textContent = location ?? "Location"
  locationField.toggleAttribute("data-empty", !location)
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

/** Sets the compose input's text and outlines `phrase` within it. */
export function renderComposeInput(root: HTMLElement, text: string, phrase?: string) {
  const $ = (selector: string) => root.querySelector<HTMLElement>(selector)!
  const highlight = $("[data-compose-highlight]")
  const measure = $("[data-compose-measure]")

  $("[data-compose-text]").textContent = text
  $("[data-compose-placeholder]").hidden = text.length > 0

  if (phrase && text.includes(phrase)) {
    measure.textContent = text.slice(0, text.indexOf(phrase))
    const left = measure.offsetWidth
    measure.textContent = phrase
    highlight.style.left = `${8 + left}px`
    highlight.style.width = `${measure.offsetWidth}px`
    highlight.hidden = false
  } else {
    highlight.hidden = true
  }
}
