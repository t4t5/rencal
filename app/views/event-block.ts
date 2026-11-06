/* What the blocks of every view share: an event's colors, state and menu. */
import { type ContextMenuEvent, type PressEvent, type ViewRef } from "nsh"
import { Menu } from "nsh/desktop"

import type { CalendarEvent } from "@/lib/cal-events"
import { eventKey } from "@/lib/cal-events"
import { isDraftEvent } from "@/lib/draft-to-event"
import { eventPaint } from "@/lib/event-paint"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"

import { calendarOf, calendars } from "@/stores/calendar"
import { triggerDelete } from "@/stores/delete"
import { canCreate } from "@/stores/draft"
import { createEventAt, dragRole } from "@/stores/drag"
import { triggerDuplicate } from "@/stores/duplicate"
import { activeEvent, setActiveEventKey } from "@/stores/events"
import { anchorPopover, pressEvent } from "@/stores/popover"

export const UNTITLED = "Untitled event"

export const paintOf = (event: CalendarEvent) =>
  eventPaint(event.color ?? calendarOf(event.calendar_slug)?.color ?? null)

export function isSelected(event: CalendarEvent) {
  const active = activeEvent()
  return active !== null && eventKey(active) === eventKey(event)
}

/** Invitations not accepted are drawn hollow and faded. */
export function isTentative(event: CalendarEvent) {
  const status = getUserResponseStatus(event, calendars())
  return status === "declined" || status === "needs-action"
}

export const isDeclined = (event: CalendarEvent) =>
  getUserResponseStatus(event, calendars()) === "declined"

export { isDraftEvent }

/** A filled block's surface, whatever state the event is in. */
export function blockStyle(event: CalendarEvent) {
  const paint = paintOf(event)
  const role = dragRole(event)
  const draft = isDraftEvent(event)
  const hollow = role !== "preview" && (draft || isTentative(event))
  const fill = isSelected(event) ? paint.selectedFill : paint.fill
  return {
    backgroundColor: draft ? `${paint.color}26` : hollow ? "transparent" : fill,
    borderWidth: hollow ? 1 : 0,
    borderStyle: "dashed" as const,
    borderColor: paint.color,
    boxShadow:
      role === "preview"
        ? `0 0 0 1.5px ${paint.color}`
        : draft
          ? `0 0 0 2px ${paint.color}40`
          : undefined,
    pointerEvents: role === "preview" ? ("none" as const) : ("auto" as const),
  }
}

/** A press on a block: drafts have their popover open already. */
export function pressBlock(event: CalendarEvent, block: ViewRef | undefined, press: PressEvent) {
  if (!isDraftEvent(event)) void pressEvent(event, block, press)
}

/** The menu of an event's block. */
export function openEventMenu(
  event: CalendarEvent,
  block: ViewRef | undefined,
  { pagePosition }: ContextMenuEvent,
) {
  if (isDraftEvent(event)) return
  const editable = !isEventReadonly(event, calendars())
  void Menu.popup(
    [
      {
        label: "Edit event",
        onSelect: () => void anchorPopover(block).then(() => setActiveEventKey(eventKey(event))),
      },
      editable &&
        canCreate() && {
          label: "Duplicate event",
          onSelect: () => triggerDuplicate(event),
        },
      editable && { label: "Delete event", onSelect: () => triggerDelete(event) },
    ],
    pagePosition,
  )
}

/** The menu of a day, wherever its view hears a secondary click. */
export function openDayMenu({ pagePosition }: ContextMenuEvent) {
  void Menu.popup(
    [{ label: "Create event", onSelect: () => createEventAt(pagePosition) }],
    pagePosition,
  )
}
