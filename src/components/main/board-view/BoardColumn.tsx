import { BoardCard } from "@/components/main/board-view/BoardCard"

import { CalendarEvent } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

export function BoardColumn({
  title,
  events,
  showDate,
  isToday,
  isLast,
  className,
}: {
  title: string
  events: CalendarEvent[]
  showDate?: boolean
  isToday?: boolean
  isLast?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="board-column"
      className={cn(
        "flex flex-col flex-1 min-w-0 border-r border-border overflow-hidden",
        isLast && "border-r-0",
        className,
      )}
    >
      {/* Column header — matches the weekday label bar style */}
      <div
        data-slot="board-column-header"
        data-today={isToday || undefined}
        className={cn(
          "flex items-center justify-between px-3 py-2 border-b border-border shrink-0",
          isToday && "bg-accent",
        )}
      >
        <span
          data-typography="numerical"
          className="text-2xs text-muted-foreground font-medium uppercase tracking-wide"
        >
          {title}
        </span>
        <span data-typography="numerical" className="text-2xs text-muted-foreground tabular-nums">
          {events.length > 0 ? events.length : ""}
        </span>
      </div>

      {/* Event list */}
      <div className="flex flex-col overflow-y-auto grow">
        {events.map((event) => (
          <BoardCard
            key={`${event.calendar_slug}::${event.id}`}
            event={event}
            showDate={showDate}
          />
        ))}

        {events.length === 0 && (
          <div
            data-typography="numerical"
            className="text-xs text-muted-foreground text-center py-8"
          >
            —
          </div>
        )}
      </div>
    </div>
  )
}
