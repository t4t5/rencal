import { format } from "date-fns"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export function CurrentTimeIndicator({ topPercent, time }: { topPercent: number; time: Date }) {
  const [colonVisible, setColonVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => setColonVisible((v) => !v), 1_000)
    return () => clearInterval(interval)
  }, [])

  const hour = format(time, "H")
  const minutes = format(time, "mm")

  return (
    <div
      className="absolute -left-3.5 -right-2 z-10 pointer-events-none flex items-center"
      style={{ top: `${topPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-[11px] font-medium text-active shrink-0 leading-none bg-background">
        {hour}
        <span className={cn(!colonVisible && "invisible")}>:</span>
        {minutes}
      </span>
      <div className="ml-1 grow border-t border-dashed border-active" />
    </div>
  )
}
