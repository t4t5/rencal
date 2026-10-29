import type { CSSProperties } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { AvailabilityPreview, InstantSpan } from "@/lib/api"
import { DAY_MINUTES } from "@/lib/event-time"

import { type DaySegment, dayGaps, daySegments } from "./day-segments"

const UNAVAILABLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 8%, transparent) 0 1.5px, transparent 1.5px 7px)",
}

const DRAFT: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--primary) 10%, transparent)",
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

/** Hatches the whole day except `open`. */
function Unavailable({ open }: { open: readonly DaySegment[] }) {
  return dayGaps(open).map((segment) => (
    <div
      key={`unavailable-${segmentKey(segment)}`}
      data-slot="availability-unavailable"
      className="absolute inset-x-0 pointer-events-none"
      style={{ ...segmentBox(segment), ...UNAVAILABLE }}
    />
  ))
}

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

type ScheduleLayerProps = {
  day: MonthDay
  preview: AvailabilityPreview | null
  tzid: string
}

function scheduleSegments(
  { day, preview, tzid }: ScheduleLayerProps,
  pick: (preview: AvailabilityPreview) => readonly InstantSpan[],
): DaySegment[] {
  return preview ? daySegments(pick(preview), day.date, tzid) : []
}

/** Schedules mode, under the events: everything outside your hours hatched. */
export function ScheduleBackground(props: ScheduleLayerProps) {
  // Before the first preview arrives, don't flash a fully hatched week.
  if (!props.preview) return null
  return <Unavailable open={scheduleSegments(props, (p) => p.available)} />
}

/** Schedules mode, over the events: busy time inside your hours. */
export function ScheduleOverlay(props: ScheduleLayerProps) {
  return <Conflicts segments={scheduleSegments(props, (p) => p.busy)} />
}

/** Share mode, under the events: everything outside the picked times hatched. */
export function ShareBackground({
  day,
  selections,
  tzid,
  dragging,
}: {
  day: MonthDay
  selections: readonly InstantSpan[]
  tzid: string
  dragging: DaySegment | null
}) {
  const open = daySegments(selections, day.date, tzid)
  return <Unavailable open={dragging ? [...open, dragging] : open} />
}

/**
 * Share mode, over the events: the picked times, removable by click, with the
 * busy time inside them hatched.
 */
export function ShareOverlay({
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
            className="absolute inset-x-0 z-10 cursor-pointer hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]"
            style={segmentBox(segment)}
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
          className="absolute inset-x-0 z-10 pointer-events-none"
          style={{ ...segmentBox(dragging), ...DRAFT }}
        />
      )}
    </>
  )
}
