import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useState } from "react"

import { useSettings } from "@/contexts/SettingsContext"

import { useLocalTzid } from "@/hooks/useLocalTzid"

export function CurrentTimeIndicator() {
  const { timeFormat } = useSettings()
  const tzid = useLocalTzid()
  const [nowMs, setNowMs] = useState(() => Date.now())

  // The colon blinks via CSS, so we only need to tick state once per minute to
  // reposition the indicator and update the displayed h:mm.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Wallclock in the viewer's zone — native Date getters would use the zone the
  // webview launched with, which goes stale after an OS timezone change.
  const now = Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(tzid)
  const currentMinutes = now.hour * 60 + now.minute
  const timeIndicatorTopPercent = (currentMinutes / 1440) * 100

  const hour =
    timeFormat === "12h" ? String(now.hour % 12 === 0 ? 12 : now.hour % 12) : String(now.hour)
  const minutes = String(now.minute).padStart(2, "0")
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
