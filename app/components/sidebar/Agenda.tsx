import {
  computed,
  cleanup,
  effect,
  keymap,
  List,
  type ListRef,
  openUrl,
  type PressEvent,
  signal,
  Text,
  untracked,
  View,
  type ViewRef,
  type ViewToken,
} from "nsh"

import { AddAccountModal } from "@/components/settings/accounts/AddAccountModal"
import { Button } from "@/components/ui/button"

import type { AgendaAllDayRow, AgendaRow, AgendaTimedRow } from "@/lib/agenda"
import { headerIndexOf, timeLabelKind } from "@/lib/agenda"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import { getMeetingUrl, hasVideoMeeting, isWithinJoinWindow } from "@/lib/conference"
import { isDraftEvent } from "@/lib/draft-to-event"
import { eventPaint } from "@/lib/event-paint"
import {
  formatDayMonth,
  formatTime,
  getRelativeDayLabel,
  plainDateFromEpochDay,
} from "@/lib/event-time"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"
import type { DateRange } from "@/lib/types"
import { cn } from "@/lib/utils"

import { VideoIcon } from "@/icons"
import {
  agendaHasEvents,
  agendaRows,
  clearAgendaSelection,
  clearGhost,
  ghostDay,
  onRevealRow,
  openAgendaItem,
  registerRowView,
  selectAgendaItem,
  selectedItem,
  showGhost,
  stickyRows,
  wasPressed,
} from "@/stores/agenda"
import {
  activeDate,
  activeGroup,
  calendarOf,
  calendars,
  onNavigate,
  setActiveDate,
} from "@/stores/calendar"
import { currentDay, now, viewerTzid } from "@/stores/clock"
import { calendarCovered, eventOpen } from "@/stores/commands"
import { triggerDelete } from "@/stores/delete"
import { activeEvent, eventsReady, eventsSettled, extendActiveRange } from "@/stores/events"
import { pressEvent } from "@/stores/popover"
import { timeFormat } from "@/stores/settings"
import { displayCase } from "@/themes"

// A day header's height: what the sticky header covers when a row scrolls in from above.
const HEADER_HEIGHT = 32
const ESTIMATED_ROW_HEIGHT = 44
// Rapid jumps go instantly, so smooth scrolls don't stack.
const RAPID_NAV_MS = 200
// A year of nothing either way is the edge of the calendar.
const MAX_EMPTY_EXTENSIONS = 6
// How long a jump owns the list: the scroll it starts must not set the active day.
const NAVIGATION_MS = 500

const paintOf = (event: CalendarEvent) =>
  eventPaint(event.color ?? calendarOf(event.calendar_slug)?.color ?? null)

const rsvpOf = (event: CalendarEvent) => getUserResponseStatus(event, calendars())
const isFaded = (event: CalendarEvent) => {
  const rsvp = rsvpOf(event)
  return rsvp === "declined" || rsvp === "needs-action"
}

/** The row's state: open, or selected by the keyboard or a press. */
function isHighlighted(event: CalendarEvent, day: number) {
  const key = eventKey(event)
  const open = activeEvent()
  const selected = selectedItem()
  return (
    (!!open && eventKey(open) === key) ||
    (!!selected && selected.key === key && selected.day === day)
  )
}

function pressRow(
  event: CalendarEvent,
  day: number,
  allDay: boolean,
  ref: ViewRef | undefined,
  press: PressEvent,
) {
  if (isDraftEvent(event)) return
  selectAgendaItem({ key: eventKey(event), day, allDay }, "press")
  void pressEvent(event, ref, press)
}

function DateBar(props: { day: number }) {
  const date = () => plainDateFromEpochDay(props.day)
  const isToday = () => date().equals(currentDay())
  // The label moves with the day it's relative to.
  const label = () => (currentDay(), getRelativeDayLabel(date()))
  return (
    <View class="h-8 flex-row items-center gap-2 bg-sidebar px-(--layout-padding) py-1.5">
      <Text class={cn("font-mono text-[13px] font-bold", displayCase(), isToday() && "text-today")}>
        {label()}
      </Text>
      <Text
        class={cn(
          "font-mono text-[13px]",
          displayCase(),
          isToday() ? "text-today" : "text-muted-foreground",
        )}
      >
        {formatDayMonth(date())}
      </Text>
    </View>
  )
}

function AllDayChip(props: { event: () => CalendarEvent; day: number }) {
  let chip: ViewRef | undefined
  effect(() => registerRowView({ key: eventKey(props.event()), day: props.day }, () => chip))
  const paint = () => paintOf(props.event())
  const faded = () => isFaded(props.event())
  const draft = () => isDraftEvent(props.event())
  const fill = () => {
    if (faded()) return "transparent"
    return isHighlighted(props.event(), props.day) ? paint().selectedFill : paint().fill
  }
  const outlined = () => faded() || draft()
  return (
    <View
      ref={chip}
      role="button"
      onPress={(press) => pressRow(props.event(), props.day, true, chip, press)}
      class={cn(
        "max-w-full rounded-(--radius-xs) px-(--event-padding-inline) py-px hover:opacity-90",
        faded() && "opacity-50",
      )}
      style={{
        backgroundColor: fill(),
        borderWidth: outlined() ? 1 : 0,
        borderStyle: "dashed",
        borderColor: paint().color,
      }}
    >
      <Text
        class={cn(
          "text-xs leading-4 line-clamp-1",
          rsvpOf(props.event()) === "declined" && "line-through",
        )}
        style={{ color: paint().foreground }}
      >
        {props.event().summary || "Untitled event"}
      </Text>
    </View>
  )
}

function AllDayRow(props: { row: () => AgendaAllDayRow }) {
  // The row goes null before its chips do, when its last all-day event leaves.
  const day = computed<AgendaAllDayRow["day"]>((last) => props.row()?.day ?? last!)
  return (
    <View class="flex-row flex-wrap gap-1 px-(--layout-padding) pb-1">
      <Each of={props.row()?.events ?? []} key={eventKey}>
        {(event) => <AllDayChip event={event} day={day()} />}
      </Each>
    </View>
  )
}

/** Shown while the meeting is about to start or in progress. */
function JoinButton(props: { event: () => CalendarEvent }) {
  const url = () => getMeetingUrl(props.event())
  return (
    <If when={url() && isWithinJoinWindow(props.event().dateInfo, now())}>
      <Button
        size="sm"
        round
        label="Join"
        class="self-center h-6 px-2.5"
        onPress={() => void openUrl(url()!)}
      />
    </If>
  )
}

function timeLabel(event: CalendarEvent, day: number) {
  const format = timeFormat()
  const kind = timeLabelKind(event, day)
  if (kind === "starts") return `Starts at ${formatTime(event.start, format)}`
  if (kind === "ends") return `Ends at ${formatTime(event.end, format)}`
  return `${formatTime(event.start, format)} - ${formatTime(event.end, format)}`
}

function TimedRow(props: { row: () => AgendaTimedRow }) {
  let block: ViewRef | undefined
  const event = () => props.row().event
  effect(() => registerRowView({ key: eventKey(event()), day: props.row().day }, () => block))
  const highlighted = () => isHighlighted(event(), props.row().day)
  const draft = () => isDraftEvent(event())
  return (
    <View
      ref={block}
      role="button"
      onPress={(press) => pressRow(event(), props.row().day, false, block, press)}
      class={cn(
        "flex-row gap-3 px-(--layout-padding) py-1",
        highlighted() ? "bg-selected" : "hover:bg-hover",
        isFaded(event()) && "opacity-50",
      )}
      style={
        draft()
          ? { borderWidth: 1, borderStyle: "dashed", borderColor: paintOf(event()).color }
          : undefined
      }
    >
      <View
        class="w-[3px] shrink-0 rounded-(--radius-xs)"
        style={{ backgroundColor: paintOf(event()).color }}
      />
      <View class="flex-1 min-w-0">
        <View class="h-4 flex-row items-center gap-1.5">
          <Text
            class={cn(
              "font-mono text-xs",
              highlighted() ? "text-selected-foreground" : "text-muted-foreground",
            )}
          >
            {timeLabel(event(), props.row().day)}
          </Text>
          <If when={hasVideoMeeting(event())}>
            <VideoIcon class="size-3 shrink-0 text-muted-foreground" />
          </If>
        </View>
        <Text
          class={cn(
            "text-sm font-medium",
            highlighted() && "text-selected-foreground",
            !event().summary && "text-muted-foreground",
            rsvpOf(event()) === "declined" && "line-through",
          )}
        >
          {event().summary || "Untitled event"}
        </Text>
      </View>
      <JoinButton event={event} />
    </View>
  )
}

const asKind = <K extends AgendaRow["kind"]>(row: AgendaRow, kind: K) =>
  row.kind === kind ? (row as Extract<AgendaRow, { kind: K }>) : null

/** A cell is reused across kinds of row, so each branch follows the row it's given. */
function AgendaCell(props: { row: () => AgendaRow }) {
  return (
    <View class={cn(props.row().last && "border-b border-border pb-2")}>
      <If when={asKind(props.row(), "header")}>{(row) => <DateBar day={row().day} />}</If>
      <If when={asKind(props.row(), "empty")}>
        <Text class="px-(--layout-padding) py-1 text-sm text-muted-foreground">No events</Text>
      </If>
      <If when={asKind(props.row(), "all-day")}>{(row) => <AllDayRow row={row} />}</If>
      <If when={asKind(props.row(), "timed")}>{(row) => <TimedRow row={row} />}</If>
    </View>
  )
}

function GetStartedState() {
  const adding = signal(false)
  return (
    <View class="items-center gap-2 p-6">
      <Text class="text-center text-sm text-muted-foreground">
        Connect your calendar to get started.
      </Text>
      <Button size="sm" class="mt-2" label="Connect a calendar" onPress={() => adding.set(true)} />
      <If when={adding()}>
        <AddAccountModal onClose={() => adding.set(false)} showLocalOnlyOption />
      </If>
    </View>
  )
}

function AgendaList() {
  let list: ListRef | undefined
  // The rows on screen, whole; a row under the sticky header counts.
  let visible: readonly ViewToken<AgendaRow>[] = []
  // The date a jump is taking the list to, until `navigating` ends.
  let target: { animated: boolean } | null = { animated: false }
  let navigating = true
  // `initialScrollIndex` goes by estimated heights: once rows are measured, land exactly.
  let measured = false
  let navigationTimer: ReturnType<typeof setTimeout> | undefined
  let lastJump = 0
  let ghostSeen = false

  const scrollToTarget = () => {
    const index = headerIndexOf(untracked(agendaRows), untracked(activeDate))
    if (index === -1 || !target) return
    list?.scrollToIndex({ index, animated: target.animated })
  }

  /** Ends the jump, landing it exactly: rows measured on the way moved what it aimed for. */
  const settle = () => {
    clearTimeout(navigationTimer)
    navigationTimer = setTimeout(() => {
      if (target) target = { animated: false }
      scrollToTarget()
      navigating = false
      target = null
    }, NAVIGATION_MS)
  }

  /** Takes the list to the active date and keeps it there while its events load. */
  const jump = (animated: boolean) => {
    navigating = true
    target = { animated }
    const rows = untracked(agendaRows)
    const date = untracked(activeDate)
    ghostSeen = false
    if (headerIndexOf(rows, date) === -1) showGhost(date)
    else if (untracked(ghostDay) !== null) clearGhost()
    scrollToTarget()
    clearTimeout(navigationTimer)
    void eventsSettled().then(() => {
      settle()
    })
  }

  // The first scroll is `initialScrollIndex`.
  if (headerIndexOf(untracked(agendaRows), untracked(activeDate)) === -1) {
    showGhost(untracked(activeDate))
  }
  const initialIndex = Math.max(0, headerIndexOf(untracked(agendaRows), untracked(activeDate)))
  settle()

  cleanup(
    onNavigate(() => {
      clearAgendaSelection()
      const at = Date.now()
      const rapid = at - lastJump < RAPID_NAV_MS
      lastJump = at
      jump(!rapid)
    }),
  )

  // New rows move what a jump aimed for; the ghost's own row is one of them.
  effect(() => {
    agendaRows()
    scrollToTarget()
  })

  // Group and time zone changes replace the sections: stay on the active date.
  let regrouped = false
  effect(() => {
    activeGroup()
    viewerTzid()
    if (regrouped) jump(false)
    regrouped = true
  })

  cleanup(
    onRevealRow((index, direction) => {
      target = null
      const shown = visible.map((token) => token.index)
      const first = Math.min(...shown)
      const inView = shown.includes(index) && !(direction <= 0 && index === first)
      if (index === -1 || inView) return
      list?.scrollToIndex(
        direction > 0
          ? { index, viewPosition: 1 }
          : { index, viewPosition: 0, viewOffset: HEADER_HEIGHT },
      )
    }),
  )

  const onViewable = (viewable: readonly ViewToken<AgendaRow>[]) => {
    visible = viewable
    if (!measured) {
      measured = true
      scrollToTarget()
      requestAnimationFrame(scrollToTarget)
    }
    const ghost = untracked(ghostDay)
    if (ghost !== null) {
      const shown = viewable.some((token) => token.item.day === ghost)
      if (!shown && ghostSeen) clearGhost()
      ghostSeen ||= shown
      return
    }
    // A selected row is the source of truth for the active date.
    if (navigating || untracked(selectedItem) || viewable.length === 0) return
    const top = viewable.reduce((a, b) => (b.index < a.index ? b : a))
    setActiveDate(plainDateFromEpochDay(top.item.day))
  }

  // The list asks once per approach, so a stretch with no events must not end the asking.
  let extending = false
  const extendUntilRows = async (update: (range: DateRange) => DateRange) => {
    if (extending) return
    extending = true
    const before = untracked(agendaRows).length
    for (let i = 0; i < MAX_EMPTY_EXTENSIONS && untracked(agendaRows).length === before; i++) {
      await extendActiveRange(update)
    }
    extending = false
  }

  const extendBack = () =>
    void extendUntilRows(({ start, end }) => ({
      start: start.subtract({ months: MONTHS_TO_LOAD }).with({ day: 1 }),
      end,
    }))

  const extendForward = () =>
    void extendUntilRows(({ start, end }) => ({
      start,
      end: end.with({ day: 1 }).add({ months: MONTHS_TO_LOAD }),
    }))

  return (
    <List
      ref={list}
      testID="agenda"
      each={agendaRows()}
      keyExtractor={(row) => row.key}
      stickyHeaderIndices={stickyRows()}
      estimatedItemSize={ESTIMATED_ROW_HEIGHT}
      initialScrollIndex={initialIndex}
      viewabilityConfig={{ itemVisibleThreshold: 1 }}
      onViewableItemsChange={({ viewableItems }) => onViewable(viewableItems)}
      onLoadMore={extendForward}
      onLoadMoreAtStart={extendBack}
      scrollbar={false}
      class="flex-1 min-h-0 bg-sidebar"
    >
      {(row) => <AgendaCell row={row} />}
    </List>
  )
}

/** What keys do to the selected row, while nothing else has the keyboard. */
function useSelectionKeys() {
  effect(() => {
    const item = selectedItem()
    if (!item || eventOpen() || calendarCovered()) return
    const remove = () => {
      const target = untracked(agendaRows)
        .flatMap(eventsOfRow)
        .find((event) => eventKey(event) === item.key)
      if (!target || isDraftEvent(target)) return
      if (!isEventReadonly(target, untracked(calendars))) triggerDelete(target)
    }
    cleanup(
      keymap.bind(
        {
          enter: () => void openAgendaItem(item),
          delete: remove,
          backspace: remove,
          escape: clearAgendaSelection,
        },
        { when: "notEditing" },
      ),
    )
  })

  // The event a press opened has closed: the row lets go, and scrolling sets the date again.
  let wasOpen = false
  effect(() => {
    const open = !!activeEvent()
    if (wasOpen && !open && wasPressed()) clearAgendaSelection()
    wasOpen = open
  })
}

const eventsOfRow = (row: AgendaRow) => {
  if (row.kind === "all-day") return row.events
  return row.kind === "timed" ? [row.event] : []
}

export function Agenda() {
  useSelectionKeys()
  return (
    <If when={eventsReady()} else={<View class="flex-1" />}>
      <If when={calendars().length > 0} else={<GetStartedState />}>
        <If
          when={agendaHasEvents()}
          else={<Text class="p-2 text-sm text-muted-foreground">No events</Text>}
        >
          <AgendaList />
        </If>
      </If>
    </If>
  )
}
