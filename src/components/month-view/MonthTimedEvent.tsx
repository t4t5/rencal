import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type MonthTimedEventProps = {
  item: TimedEventItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  onClick: () => void
}

export function MonthTimedEvent({
  item,
  isActive,
  isPending,
  isDeclined,
  onClick,
}: MonthTimedEventProps) {
  return (
    <div
      data-event-clickable
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default px-0.5 hover:bg-hoverBg rounded shrink-0",
        isActive && "bg-accent!",
        (isPending || isDeclined) && "opacity-50",
        isDeclined && "line-through",
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
      <span className="truncate">{item.event.summary}</span>
    </div>
  )
}
