import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useState } from "react"

import { cn, useDisplaySettings, useViewerTzid } from "@/sdk"

import { DAY_MINUTES } from "./grid"

/** `inset` keeps the indicator inside its column instead of overhanging the neighbours (and the gutter). */
export function CurrentTimeIndicator({ inset = false }: { inset?: boolean }) {
  const { timeFormat } = useDisplaySettings()
  const tzid = useViewerTzid()
  const [, tick] = useState(0)

  // The colon blinks via CSS, so we only need to tick state once per minute to
  // reposition the indicator and update the displayed h:mm.
  useEffect(() => {
    const interval = setInterval(() => tick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = Temporal.Now.zonedDateTimeISO(tzid)

  const currentMinutes = now.hour * 60 + now.minute
  const timeIndicatorTopPercent = (currentMinutes / DAY_MINUTES) * 100

  const hour = timeFormat === "12h" ? (now.hour % 12 || 12).toString() : now.hour.toString()
  const minutes = now.minute.toString().padStart(2, "0")
  const ampm = timeFormat === "12h" ? (now.hour < 12 ? "am" : "pm") : ""

  return (
    <div
      className={cn(
        "absolute z-10 pointer-events-none flex items-center",
        inset ? "inset-x-0 pl-1" : "-left-3.5 -right-1",
      )}
      style={{ top: `${timeIndicatorTopPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-2xs font-medium text-today shrink-0 leading-none">
        {hour}
        <span style={{ animation: "colon-blink 1s steps(2, end) infinite" }}>:</span>
        {minutes}
        {ampm}
      </span>
      <div className="ml-1 grow border-t border-dashed border-today" />
    </div>
  )
}
