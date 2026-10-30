import {
  type CalendarEvent,
  EventMenu,
  formatTime,
  UntitledEventText,
  useDisplaySettings,
  useEventProps,
} from "@/sdk"

export function MonthTimedEvent({ event }: { event: CalendarEvent }) {
  const eventProps = useEventProps(event, { drag: "pill" })

  return (
    <EventMenu event={event}>
      <div
        {...eventProps}
        data-view="month"
        className="flex items-center gap-(--event-padding-inline) pr-(--event-padding-inline) text-xs truncate cursor-default rounded-xs shrink-0"
      >
        <MonthTimedEventContent event={event} />
      </div>
    </EventMenu>
  )
}

export function MonthTimedEventContent({ event }: { event: CalendarEvent }) {
  const { timeFormat } = useDisplaySettings()

  return (
    <>
      <div data-slot="calendar-event-color-marker" className="w-0.5 self-stretch shrink-0" />
      <span className="truncate">
        <span data-slot="calendar-event-time" data-typography="numerical" className="text-2xs">
          {formatTime(event.start, timeFormat)}
        </span>{" "}
        <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
      </span>
    </>
  )
}
