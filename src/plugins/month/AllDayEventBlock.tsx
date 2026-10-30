import { cn, UntitledEventText, useEventProps } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"
import type { AllDayLaneItem } from "./useMonthEventLayout"

export function MonthAllDayEvent({ item }: { item: AllDayLaneItem }) {
  const { event } = item
  const eventProps = useEventProps(event, {
    drag: "pill",
    anchor: item.endCol - item.startCol === 7 ? "pointer" : "element",
  })

  return (
    <div
      {...eventProps}
      data-view="month"
      data-kind="all-day"
      className={cn(
        "absolute truncate px-(--event-padding-inline) py-px text-xs cursor-default",
        item.isStart && "rounded-l-xs",
        item.isEnd && "rounded-r-xs",
      )}
      style={{ ...allDayBarStyle(item, item.lane), ...eventProps.style }}
    >
      <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
    </div>
  )
}
