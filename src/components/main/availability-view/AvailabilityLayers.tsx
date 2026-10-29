import { Temporal } from "@js-temporal/polyfill"
import type { CSSProperties } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { AvailabilityPreview, InstantSpan } from "@/lib/api"
import { DAY_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { type DaySegment, daySegments } from "./day-segments"

const OUTSIDE_HOURS: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--foreground) 4%, transparent)",
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 9%, transparent) 0 1px, transparent 1px 7px)",
}

// Red rather than the warning tint: several themes' primary is orange, and
// blocked must not read as bookable.
const BUSY: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--destructive) 8%, transparent)",
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 45%, transparent) 0 1.5px, transparent 1.5px 6px)",
}

const FREE: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)",
  borderColor: "color-mix(in oklab, var(--primary) 55%, transparent)",
}

function segmentBox({ startMinutes, endMinutes }: DaySegment): CSSProperties {
  return {
    top: `${(startMinutes / DAY_MINUTES) * 100}%`,
    height: `${((endMinutes - startMinutes) / DAY_MINUTES) * 100}%`,
  }
}

const segmentKey = (s: DaySegment) => `${s.startMinutes}-${s.endMinutes}`

/**
 * Schedules mode, under the events: outside your hours, your hours, what
 * blocks them, and the bookable windows left. Days past the booking window fade.
 */
export function ScheduleLayers({
  day,
  preview,
  tzid,
  horizonEnd,
}: {
  day: MonthDay
  preview: AvailabilityPreview | null
  tzid: string
  horizonEnd: Temporal.Instant | null
}) {
  const segments = (spans: readonly InstantSpan[]) => daySegments(spans, day.date, tzid)
  const beyondHorizon =
    horizonEnd !== null &&
    Temporal.Instant.compare(day.date.toZonedDateTime(tzid).toInstant(), horizonEnd) >= 0

  return (
    <div
      data-slot="availability-layers"
      data-beyond-horizon={beyondHorizon || undefined}
      className={cn("absolute inset-0 pointer-events-none", beyondHorizon && "opacity-50")}
    >
      <div data-slot="availability-outside" className="absolute inset-0" style={OUTSIDE_HOURS} />
      {preview &&
        segments(preview.available).map((segment) => (
          <div
            key={`available-${segmentKey(segment)}`}
            data-slot="availability-hours"
            className="absolute inset-x-0 bg-background"
            style={segmentBox(segment)}
          />
        ))}
      {preview &&
        segments(preview.busy).map((segment) => (
          <div
            key={`busy-${segmentKey(segment)}`}
            data-slot="availability-busy"
            className="absolute inset-x-0"
            style={{ ...segmentBox(segment), ...BUSY }}
          />
        ))}
      {preview &&
        segments(preview.free).map((segment) => (
          <div
            key={`free-${segmentKey(segment)}`}
            data-slot="availability-free"
            className="absolute inset-x-0.5 rounded-sm border"
            style={{ ...segmentBox(segment), ...FREE }}
          />
        ))}
    </div>
  )
}

/**
 * Share mode, over the events: the picked times, removable by click, with
 * the parts that overlap busy time hatched as a warning.
 */
export function ShareLayers({
  day,
  selections,
  busy,
  tzid,
  dragging,
  onRemove,
}: {
  day: MonthDay
  selections: readonly InstantSpan[]
  busy: readonly InstantSpan[]
  tzid: string
  dragging: DaySegment | null
  onRemove: (span: InstantSpan) => void
}) {
  return (
    <>
      {selections.flatMap((span) =>
        daySegments([span], day.date, tzid).map((segment) => (
          <button
            key={`${span.start.toString()}-${segmentKey(segment)}`}
            type="button"
            tabIndex={-1}
            title="Remove"
            data-slot="availability-selection"
            className="absolute inset-x-0.5 z-10 rounded-sm border cursor-pointer hover:brightness-110"
            style={{ ...segmentBox(segment), ...FREE }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(span)
            }}
          />
        )),
      )}
      {daySegments(busy, day.date, tzid).map((segment) => (
        <div
          key={`busy-${segmentKey(segment)}`}
          data-slot="availability-selection-busy"
          className="absolute inset-x-0.5 z-10 rounded-sm border-l-2 pointer-events-none"
          style={{ ...segmentBox(segment), ...BUSY, borderColor: "var(--destructive)" }}
        />
      ))}
      {dragging && (
        <div
          data-slot="availability-selection-draft"
          className="absolute inset-x-0.5 z-10 rounded-sm border border-dashed pointer-events-none"
          style={{ ...segmentBox(dragging), ...FREE }}
        />
      )}
    </>
  )
}
