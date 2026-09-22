import { openUrl } from "@tauri-apps/plugin-opener"
import { memo, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useSettings } from "@/contexts/SettingsContext"

import { useNow } from "@/hooks/useNow"
import { CalendarEvent } from "@/lib/cal-events"
import { getMeetingUrl, hasVideoMeeting, isWithinJoinWindow } from "@/lib/conference"
import type { TimeFormat } from "@/lib/event-time"
import { type EventDateInfo, formatDateKey, formatTime, isSameDay } from "@/lib/event-time"

import { VideoIcon } from "@/icons/video"

export const AgendaTimedEventBlock = memo(function EventRow({
  event,
  dateKey,
}: {
  event: CalendarEvent
  dateKey: string
}) {
  const { timeFormat } = useSettings()

  const timeLabel = getTimeLabel(event, dateKey, timeFormat)
  const meetingUrl = getMeetingUrl(event)

  return (
    <>
      <div data-slot="calendar-event-color-marker" className="w-[3px] shrink-0 rounded-base" />
      <div className="relative flex-1 min-w-0 text-sm">
        <div
          data-slot="calendar-event-time"
          className="flex items-center gap-1.5 text-muted-foreground numerical text-xs h-4"
        >
          <span>{timeLabel}</span>
          {hasVideoMeeting(event) && <VideoIcon className="size-3 shrink-0" />}
        </div>
        <div data-slot="calendar-event-title" className="font-medium">
          {event.summary || <UntitledEventText />}
        </div>
      </div>
      {meetingUrl && <JoinMeetingButton url={meetingUrl} dateInfo={event.dateInfo} />}
    </>
  )
})

/**
 * Rendered only while the meeting is about to start or in progress. Lives in
 * its own component so only rows with a meeting link subscribe to the clock.
 */
function JoinMeetingButton({ url, dateInfo }: { url: string; dateInfo: EventDateInfo }) {
  const nowMs = useNow()

  if (!isWithinJoinWindow(dateInfo, nowMs)) return null

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Joining must not also toggle the row's event popover.
    e.stopPropagation()
    openUrl(url)
  }

  return (
    <Button
      size="sm"
      round
      tabIndex={-1}
      className="self-center h-6 px-2.5 text-xs"
      // Keep focus on the agenda row so keyboard navigation isn't disturbed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
    >
      Join
    </Button>
  )
}

/**
 * A multi-day timed event only appears as a timed row on the days it partially
 * covers (fully covered days render as all-day chips), so a row that isn't a
 * same-day range shows just the boundary it touches.
 */
function getTimeLabel(event: CalendarEvent, dateKey: string, timeFormat: TimeFormat): string {
  const { start, end } = event

  if (isSameDay(start, end)) {
    return `${formatTime(start, timeFormat)} - ${formatTime(end, timeFormat)}`
  }

  return formatDateKey(start) === dateKey
    ? `Starts at ${formatTime(start, timeFormat)}`
    : `Ends at ${formatTime(end, timeFormat)}`
}
