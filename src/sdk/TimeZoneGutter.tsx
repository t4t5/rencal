/** Shared sizing and divider for calendar views with a time-zone gutter. */
import { type PointerEvent, useRef, useState } from "react"

const preference = "rencal.time-zone-column-width"

function preferredZoneWidth() {
  const saved = Number(localStorage.getItem(preference))
  return Number.isFinite(saved) && saved > 0 ? saved : 48
}

/** Shares a per-zone width preference and reserves space for the calendar. */
export function useTimeZoneGutter(zoneCount: number, available: number, reserved: number) {
  const [zoneWidth, setZoneWidth] = useState(preferredZoneWidth)
  const max = Math.max(1, Math.min(zoneCount * 200, available - reserved))
  const min = Math.min(max, zoneCount * 32)
  const clamp = (value: number) => Math.min(max, Math.max(min, value))
  const width = clamp(zoneWidth * zoneCount)
  function resize(value: number) {
    const next = clamp(value) / zoneCount
    setZoneWidth(next)
    localStorage.setItem(preference, String(next))
  }
  return { width, min, max, resize }
}

/** Draggable and keyboard-operable divider on the calendar side of the gutter. */
export function TimeZoneDivider({ width, min, max, resize }: ReturnType<typeof useTimeZoneGutter>) {
  const drag = useRef<{ id: number; offset: number } | null>(null)
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null
  }
  return (
    <div
      role="separator"
      aria-label="Time zone column width"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      className="absolute inset-y-0 z-30 w-2 -translate-x-1/2 touch-none select-none cursor-col-resize hover:bg-accent/50 focus-visible:outline"
      style={{ left: width }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, offset: event.clientX - width }
      }}
      onPointerMove={(event) => {
        if (drag.current?.id === event.pointerId) resize(event.clientX - drag.current.offset)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={(event) => {
        const steps: Record<string, number> = {
          ArrowLeft: width - 8,
          ArrowRight: width + 8,
          Home: min,
          End: max,
        }
        if (!Object.hasOwn(steps, event.key)) return
        event.preventDefault()
        event.stopPropagation()
        resize(steps[event.key])
      }}
    />
  )
}
