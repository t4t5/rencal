import { format } from "date-fns"
import { useEffect, useState } from "react"

import { useSettings } from "@/contexts/SettingsContext"

import { cn } from "@/lib/utils"

export function CurrentTimeIndicator({
  visibleStartHour,
  rangeHours,
}: {
  visibleStartHour: number
  rangeHours: number
}) {
  const [, setTick] = useState(0)

  // Update time indicator every 60s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const rangeStartMin = visibleStartHour * 60
  const rangeMinutes = rangeHours * 60
  const timeIndicatorTopPercent = ((currentMinutes - rangeStartMin) / rangeMinutes) * 100

  const showTimeIndicator = timeIndicatorTopPercent >= 0 && timeIndicatorTopPercent <= 100

  const { timeFormat } = useSettings()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [colonVisible, setColonVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
      setColonVisible((v) => !v)
    }, 1_000)
    return () => clearInterval(interval)
  }, [])

  const hour = format(currentTime, timeFormat === "12h" ? "h" : "H")
  const minutes = format(currentTime, "mm")
  const ampm = timeFormat === "12h" ? format(currentTime, "a").toLowerCase() : ""

  if (!showTimeIndicator) return null

  return (
    <div
      className="absolute -left-3.5 -right-1 z-10 pointer-events-none flex items-center"
      style={{ top: `${timeIndicatorTopPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-[11px] font-medium text-active shrink-0 leading-none [text-shadow:0_0_4px_var(--background)]">
        {hour}
        <span className={cn(!colonVisible && "invisible")}>:</span>
        {minutes}
        {ampm}
      </span>
      <div className="ml-1 grow border-t border-dashed border-active" />
    </div>
  )
}
