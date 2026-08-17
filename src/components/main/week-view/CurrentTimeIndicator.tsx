import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useState } from "react"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { DAY_MINUTES, getViewerTzid } from "@/lib/event-time"

export function CurrentTimeIndicator() {
  const { timeFormat } = useSettings()

  useViewerTzid()
  const [, tick] = useState(0)

  // The colon blinks via CSS, so we only need to tick state once per minute to
  // reposition the indicator and update the displayed h:mm.
  useEffect(() => {
    const interval = setInterval(() => tick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = Temporal.Now.zonedDateTimeISO(getViewerTzid())

  const currentMinutes = now.hour * 60 + now.minute
  const timeIndicatorTopPercent = (currentMinutes / DAY_MINUTES) * 100

  const hour = timeFormat === "12h" ? (now.hour % 12 || 12).toString() : now.hour.toString()
  const minutes = now.minute.toString().padStart(2, "0")
  const ampm = timeFormat === "12h" ? (now.hour < 12 ? "am" : "pm") : ""

  return (
    <div
      className="absolute -left-3.5 -right-1 z-10 pointer-events-none flex items-center"
      style={{ top: `${timeIndicatorTopPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-[11px] font-medium text-today shrink-0 leading-none">
        {hour}
        <span style={{ animation: "colon-blink 1s steps(2, end) infinite" }}>:</span>
        {minutes}
        {ampm}
      </span>
      <div className="ml-1 grow border-t border-dashed border-today" />
    </div>
  )
}
