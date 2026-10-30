import { cn, EventMenu, UntitledEventText, useEventProps, useEventState } from "@/sdk"

import { GUTTER_WIDTH } from "./grid"
import type { AllDayLaneItem } from "./useDayRangeLayout"

export function WeekAllDayBar({
  item,
  colOffset,
  rowOffset,
}: {
  item: AllDayLaneItem
  // Added to item.startCol/endCol so bar aligns with the parent grid's day columns:
  colOffset: number
  // Added to item.lane so bar lands on the right row in the parent grid:
  rowOffset: number
}) {
  const { event } = item
  const fillsRow = item.endCol - item.startCol >= 7
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
        gridColumn: `${item.startCol + colOffset} / ${item.endCol + colOffset}`,
        gridRow: item.lane + 1 + rowOffset,
      }}
    >
      <EventMenu event={event}>
        <div
          {...eventProps}
          data-view="week"
          // Multi-day timed events sit in the all-day lane too.
          data-kind="all-day"
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
      </EventMenu>
    </div>
  )
}
