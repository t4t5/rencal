import {
  type AllDayBar,
  type CalendarEvent,
  cn,
  UntitledEventText,
  useEventProps,
  useEventState,
} from "@/sdk"

import { GUTTER_WIDTH } from "./grid"

export function WeekAllDayBar({
  bar,
  colOffset,
  rowOffset,
}: {
  bar: AllDayBar<CalendarEvent>
  // Grid columns before the first day's, so the bar aligns with the parent grid's day columns:
  colOffset: number
  // Grid rows before the first lane's, so the bar lands on the right row in the parent grid:
  rowOffset: number
}) {
  const event = bar.item
  const fillsRow = bar.span >= 7
  const eventProps = useEventProps(event, {
    drag: "pill",
    anchor: fillsRow ? "pointer" : "element",
  })
  const { drag } = useEventState(event)

  return (
    <div
      data-slot="week-all-day-lane"
      className={cn("p-0.5 py-px pr-[3px]", drag === "preview" && "pointer-events-none")}
      style={{
        gridColumn: `${bar.column + 1 + colOffset} / span ${bar.span}`,
        gridRow: bar.lane + 1 + rowOffset,
      }}
    >
      <div
        {...eventProps}
        data-view="week"
        className="flex items-center px-(--event-padding-inline) py-px leading-4 rounded-xs text-xs cursor-default"
      >
        {/* Make title in multi-day event sticky so it stays visible when user scrolls: */}
        <span
          data-slot="calendar-event-title"
          className="sticky truncate min-w-0"
          style={{ left: GUTTER_WIDTH + 4 }}
        >
          {event.summary || <UntitledEventText />}
        </span>
      </div>
    </div>
  )
}
