import { useEffect, useRef, type CSSProperties } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useEventDrag, type ActiveEventDrag, type DragFloat } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import { getCalendarColor } from "@/lib/calendar-styles"
import { getEventBlockStyle } from "@/lib/event-styles"
import { formatTime, isAllDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

/**
 * Full-window layer shown while an event is being dragged. It owns the grabbing
 * cursor and carries the floating copy of the event that follows the pointer.
 * Drop targets are hit-tested through it, so it never needs pointer events off.
 */
export function EventDragOverlay() {
  const { drag } = useEventDrag()
  if (!drag) return null

  return (
    <div className="fixed inset-0 z-50 cursor-grabbing select-none">
      <DragFloatCard key={drag.sourceKey} drag={drag} />
    </div>
  )
}

function floatPosition(float: DragFloat, x: number, y: number): CSSProperties {
  if (float.kind === "block") {
    return {
      left: x - float.offsetX,
      top: y - float.offsetY,
      width: float.width,
      height: float.height,
    }
  }
  return { left: x, top: y, transform: "translate(-12px, -50%)" }
}

function DragFloatCard({ drag }: { drag: ActiveEventDrag }) {
  const { calendars } = useCalendars()
  const { timeFormat } = useSettings()
  const ref = useRef<HTMLDivElement>(null)
  // Pointer position lives outside React state: the card re-renders only when
  // the drop target changes, and moves via direct style writes in between.
  const posRef = useRef(drag.pointer)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY }
      const el = ref.current
      if (!el) return
      const { left, top } = floatPosition(drag.float, e.clientX, e.clientY)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [drag.float])

  const { event, float } = drag
  const range = drag.target ?? { start: event.start, end: event.end }
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  const summary = event.summary || <UntitledEventText />
  const showTime = float.kind === "block" && !isAllDay(range.start)

  return (
    <div
      ref={ref}
      className={cn(
        "absolute overflow-hidden rounded text-xs shadow-xl",
        float.kind === "block" ? "px-1.5 py-1" : "px-1.5 py-0.5 whitespace-nowrap",
      )}
      style={{
        ...floatPosition(float, posRef.current.x, posRef.current.y),
        ...getEventBlockStyle({
          calendarColor: getCalendarColor(calendar),
          eventColor: event.color,
          highlighted: true,
        }),
      }}
    >
      <div className="font-medium leading-tight truncate">{summary}</div>
      {showTime && (
        <div className="opacity-80 leading-tight truncate">
          {formatTime(range.start, timeFormat)} – {formatTime(range.end, timeFormat)}
        </div>
      )}
    </div>
  )
}
