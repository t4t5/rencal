// import { format } from "date-fns"
import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type MonthTimedEventProps = {
  item: TimedEventItem
  isActive: boolean
  onClick: () => void
}

export function MonthTimedEvent({ item, isActive, onClick }: MonthTimedEventProps) {
  return (
    <div
      data-event-clickable
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default px-0.5 hover:bg-hoverBg rounded",
        isActive && "bg-accent!",
      )}
      onClick={(e) => {
        e.stopPropagation()
        setEventAnchor(e.currentTarget)
        onClick()
      }}
    >
      <div
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: item.color ?? "var(--primary)" }}
      />
      {/*<span className="text-muted-foreground shrink-0">{format(item.event.start, "HH:mm")}</span>*/}
      <span className="truncate">{item.event.summary}</span>
    </div>
  )
}
