import { type AllDayBar, type CalendarEvent, cn, UntitledEventText, useEventProps } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"

export function MonthAllDayEvent({ bar }: { bar: AllDayBar<CalendarEvent> }) {
  const event = bar.item
  const eventProps = useEventProps(event, {
    drag: "pill",
    anchor: bar.span === 7 ? "pointer" : "element",
  })

  return (
    <div
      {...eventProps}
      data-view="month"
      className={cn(
        "absolute truncate px-(--event-padding-inline) py-px text-xs cursor-default",
        bar.isStart && "rounded-l-xs",
        bar.isEnd && "rounded-r-xs",
      )}
      style={{ ...allDayBarStyle(bar), ...eventProps.style }}
    >
      <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
    </div>
  )
}
