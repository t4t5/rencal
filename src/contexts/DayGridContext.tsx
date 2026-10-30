/*
 * What happens on the days views mark with `dayAttributes`, so every view gets
 * it the same way: pressing and dragging draws a new event, double-clicking
 * opens one, and the context menu offers "Create event" there and renCal's
 * event menu on events. Handlers sit on the viewport around the views, and the
 * range being drawn is shared with them to render.
 */
import { type CSSProperties, type MouseEvent, type ReactElement, useMemo, useState } from "react"

import { EventMenuItems } from "@/components/EventMenuItems"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useCreateDrag } from "@/hooks/useCreateDrag"
import { useCreateSelectionColor } from "@/hooks/useCreateSelectionColor"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { getLastEventEndTime } from "@/lib/active-day-draft"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { closestDay, type DayElement } from "@/lib/day-grid"
import { type CreateSelection, minutesAtY } from "@/lib/drag-to-create"
import { elementAnchor, type PopoverAnchor } from "@/lib/event-anchor"
import { getCreateSelectionStyle } from "@/lib/event-styles"
import { atTime } from "@/lib/event-time"
import { setMenuEventKey } from "@/lib/menu-event"
import { createStrictContext } from "@/lib/strict-context"

const [DayGridContextProvider, useDayGridContext] = createStrictContext<{
  selection: CreateSelection | null
}>("DayGrid")

export function useCreateSelection(): CreateSelection | null {
  return useDayGridContext().selection
}

type MenuTarget =
  | { kind: "event"; event: CalendarEvent; anchor: PopoverAnchor }
  | { kind: "day"; day: DayElement; y: number }

const isOnEvent = (target: EventTarget) =>
  target instanceof Element && target.closest("[data-event-clickable]") !== null

/** Wraps the viewport the views render in, which must accept a ref and props. */
export function DayGridProvider({ children }: { children: ReactElement }) {
  const { calendarEvents } = useCalEvents()
  const openDayDraft = useOpenDayDraft()
  const { selection, startCreateDrag } = useCreateDrag()
  const selectionColor = getCreateSelectionStyle(useCreateSelectionColor())
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const value = useMemo(() => ({ selection }), [selection])

  const openDraftOn = ({ el, day, zone }: DayElement, y: number) => {
    if (zone === "all-day") {
      openDayDraft(day, el, { allDay: true })
    } else if (zone === "day") {
      openDayDraft(day, el, { start: getLastEventEndTime(day, calendarEvents) })
    } else {
      const minutes = minutesAtY(el.getBoundingClientRect(), y)
      const hour = Math.max(0, Math.min(23, Math.floor(minutes / 60)))
      openDayDraft(day, el, { allDay: false, start: atTime(day, hour), anchorY: y })
    }
  }

  const menuTargetFor = (e: MouseEvent): MenuTarget | null => {
    const eventEl =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-event-key][data-event-clickable]")
        : null
    const event = eventEl && calendarEvents.find((ev) => eventKey(ev) === eventEl.dataset.eventKey)
    if (eventEl && event) return { kind: "event", event, anchor: elementAnchor(eventEl, e.clientX) }
    const day = closestDay(e.target)
    return day ? { kind: "day", day, y: e.clientY } : null
  }

  return (
    <DayGridContextProvider value={value}>
      <ContextMenu modal={false} onOpenChange={(open) => !open && setMenuEventKey(null)}>
        <ContextMenuTrigger
          asChild
          style={
            {
              "--create-selection-color": selectionColor["--calendar-event-color"],
            } as CSSProperties
          }
          onPointerDown={(e) => {
            const day = closestDay(e.target)
            // Only presses on the day itself, so what's drawn on it keeps its own.
            if (day?.el === e.target) startCreateDrag(day, e)
          }}
          onDoubleClick={(e) => {
            const day = closestDay(e.target)
            if (day && !isOnEvent(e.target)) openDraftOn(day, e.clientY)
          }}
          onContextMenu={(e) => {
            // A view's own context menu took it.
            if (e.defaultPrevented) return
            const target = menuTargetFor(e)
            // Keeps the menu closed where there's nothing to offer.
            if (!target) e.preventDefault()
            setMenu(target)
            setMenuEventKey(target?.kind === "event" ? eventKey(target.event) : null)
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {menu?.kind === "event" && <EventMenuItems event={menu.event} anchor={menu.anchor} />}
          {menu?.kind === "day" && (
            // After the menu has closed, so the popover it opens stays open.
            <ContextMenuItem onClick={() => setTimeout(() => openDraftOn(menu.day, menu.y))}>
              Create event
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </DayGridContextProvider>
  )
}
