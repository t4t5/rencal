import { format } from "date-fns"
import { useEffect, useState } from "react"

import { useSettings } from "@/contexts/SettingsContext"

export function CurrentTimeIndicator() {
  const { timeFormat } = useSettings()
  const [now, setNow] = useState(() => new Date())

  // The colon blinks via CSS, so we only need to tick state once per minute to
  // reposition the indicator and update the displayed h:mm.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const timeIndicatorTopPercent = (currentMinutes / 1440) * 100

  const hour = format(now, timeFormat === "12h" ? "h" : "H")
  const minutes = format(now, "mm")
  const ampm = timeFormat === "12h" ? format(now, "a").toLowerCase() : ""

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
