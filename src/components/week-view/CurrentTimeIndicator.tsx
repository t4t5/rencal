import { format } from "date-fns"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export function CurrentTimeIndicator({ topPercent }: { topPercent: number }) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [colonVisible, setColonVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
      setColonVisible((v) => !v)
    }, 1_000)
    return () => clearInterval(interval)
  }, [])

  const hour = format(currentTime, "H")
  const minutes = format(currentTime, "mm")

  return (
    <div
      className="absolute -left-3.5 -right-1 z-10 pointer-events-none flex items-center"
      style={{ top: `${topPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-[11px] font-medium text-active shrink-0 leading-none [text-shadow:0_0_4px_black]">
        {hour}
        <span className={cn(!colonVisible && "invisible")}>:</span>
        {minutes}
      </span>
      <div className="ml-1 grow border-t border-dashed border-active" />
    </div>
  )
}
