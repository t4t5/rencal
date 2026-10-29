import { Temporal } from "@js-temporal/polyfill"
import type { CSSProperties } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { AvailabilityPreview, InstantSpan } from "@/lib/api"
import { DAY_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { type DaySegment, daySegments } from "./day-segments"

const OUTLINE: CSSProperties = { borderColor: "var(--primary)" }

const DRAFT: CSSProperties = {
  ...OUTLINE,
  backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)",
}

// Red rather than the warning tint: several themes' primary is orange, and
// blocked must not read as bookable.
const CONFLICT: CSSProperties = {
  borderColor: "var(--destructive)",
  backgroundColor: "color-mix(in oklab, var(--destructive) 8%, transparent)",
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 45%, transparent) 0 1.5px, transparent 1.5px 6px)",
}

function segmentBox({ startMinutes, endMinutes }: DaySegment): CSSProperties {
  return {
    top: `${(startMinutes / DAY_MINUTES) * 100}%`,
    height: `${((endMinutes - startMinutes) / DAY_MINUTES) * 100}%`,
  }
}

const segmentKey = (s: DaySegment) => `${s.startMinutes}-${s.endMinutes}`

function Conflicts({ segments }: { segments: readonly DaySegment[] }) {
  return segments.map((segment) => (
    <div
      key={`conflict-${segmentKey(segment)}`}
      data-slot="availability-conflict"
      className="absolute inset-x-0.5 z-10 rounded-sm border-l-2 pointer-events-none"
      style={{ ...segmentBox(segment), ...CONFLICT }}
    />
  ))
}

/**
 * Schedules mode, over the events: your hours outlined, with the busy time
 * inside them hatched. Days past the booking window fade.
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
      {preview &&
        segments(preview.available).map((segment) => (
          <div
            key={`available-${segmentKey(segment)}`}
            data-slot="availability-hours"
            className="absolute inset-x-0.5 z-10 rounded-sm border border-dashed"
            style={{ ...segmentBox(segment), ...OUTLINE }}
          />
        ))}
      {preview && <Conflicts segments={segments(preview.busy)} />}
    </div>
  )
}

/**
 * Share mode, over the events: the picked times outlined and removable by
 * click, with the busy time inside them hatched.
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
            className="absolute inset-x-0.5 z-10 rounded-sm border border-dashed cursor-pointer hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]"
            style={{ ...segmentBox(segment), ...OUTLINE }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(span)
            }}
          />
        )),
      )}
      <Conflicts segments={daySegments(busy, day.date, tzid)} />
      {dragging && (
        <div
          data-slot="availability-selection-draft"
          className="absolute inset-x-0.5 z-10 rounded-sm border border-dashed pointer-events-none"
          style={{ ...segmentBox(dragging), ...DRAFT }}
        />
      )}
    </>
  )
}
