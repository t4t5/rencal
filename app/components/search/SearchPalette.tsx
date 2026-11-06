import { computed, effect, signal, Text, untracked, View } from "nsh"
import type { CommandEntry, CommandItem } from "nsh/base"

import { Command } from "@/components/ui/command"
import { Dialog } from "@/components/ui/dialog"

import { api } from "@/lib/api"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { eventPaint } from "@/lib/event-paint"
import { formatShortDate, formatTime, isAllDay } from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"
import { logger } from "@/lib/logger"
import { prepareSearchResults } from "@/lib/search-results"
import { cn } from "@/lib/utils"

import { jumpToEvent } from "@/stores/agenda"
import { calendarOf, calendars, visibleSlugs } from "@/stores/calendar"
import { searchOpen, setSearchOpen } from "@/stores/commands"
import { timeFormat } from "@/stores/settings"

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

const whenOf = (event: CalendarEvent) =>
  isAllDay(event.start)
    ? formatShortDate(event.start)
    : `${formatShortDate(event.start)} · ${formatTime(event.start, timeFormat())}`

function ResultRow(props: { event: CalendarEvent | undefined }) {
  const paint = () => {
    const event = props.event
    return eventPaint(event?.color ?? (event && calendarOf(event.calendar_slug)?.color) ?? null)
  }
  const rsvp = () => (props.event ? getUserResponseStatus(props.event, calendars()) : null)
  const faded = () => rsvp() === "declined" || rsvp() === "needs-action"
  return (
    <View class={cn("flex-row items-stretch gap-2", faded() && "opacity-50")}>
      <View class="w-[3px] shrink-0" style={{ backgroundColor: paint().color }} />
      <View class="flex-1 min-w-0">
        <Text
          class={cn(
            "text-sm font-medium text-popover-foreground group-focus:text-accent-foreground truncate",
            rsvp() === "declined" && "line-through",
          )}
        >
          {props.event?.summary ?? ""}
        </Text>
        <Text class="text-xs text-muted-foreground">{props.event ? whenOf(props.event) : ""}</Text>
      </View>
    </View>
  )
}

export function SearchPalette() {
  const query = signal("")
  const results = signal<CalendarEvent[]>([])
  const searching = signal(false)
  let latestSearch = 0

  const hasQuery = () => query().length >= MIN_QUERY_LENGTH

  const search = async (id: number, text: string, slugs: string[]) => {
    try {
      const found = await api.events.search({ calendar_slugs: slugs, query: text })
      if (id === latestSearch) results.set(prepareSearchResults(found))
    } catch (error) {
      logger.error("Event search failed:", error)
      if (id === latestSearch) results.set([])
    } finally {
      if (id === latestSearch) searching.set(false)
    }
  }

  effect(() => {
    const id = ++latestSearch
    const text = query()
    const slugs = visibleSlugs()
    const open = searchOpen()
    results.set([])
    const willSearch = open && text.length >= MIN_QUERY_LENGTH && slugs.length > 0
    searching.set(willSearch)
    if (!willSearch) return
    const timer = setTimeout(() => void search(id, text, slugs), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  effect(() => {
    if (!searchOpen()) query.set("")
  })

  const items = computed((): CommandItem[] =>
    results().map((event) => ({ id: eventKey(event), label: event.summary ?? "" })),
  )

  const eventOf = (entry: CommandEntry) => results().find((e) => eventKey(e) === entry.id)

  const select = (id: string) => {
    const event = untracked(results).find((candidate) => eventKey(candidate) === id)
    setSearchOpen(false)
    if (event) void jumpToEvent(event)
  }

  return (
    <Dialog
      open={searchOpen()}
      onOpenChange={setSearchOpen}
      showCloseButton={false}
      class="mt-5 mb-auto w-[672px] gap-0 overflow-hidden border-0 p-0"
    >
      <Command
        items={items()}
        query={query()}
        onQueryChange={(event) => query.set(event.query)}
        filterable={false}
        loading={searching()}
        testID="search-events"
        placeholder="Search your events..."
        accessibilityLabel="Search events"
        searchAccessibilityLabel="Search visible calendars for an event"
        searchBarClass={cn("h-12", (!hasQuery() || searching()) && "border-b-0")}
        searchClass="text-base"
        listClass={cn("max-h-[400px] p-0", !hasQuery() && "max-h-0")}
        itemClass="rounded-none px-3 py-1.5"
        onCancel={() => setSearchOpen(false)}
        onSelect={(event) => select(event.id)}
        searchSuffix={
          <If when={searching()}>
            <Text class="text-xs text-muted-foreground">Searching…</Text>
          </If>
        }
        renderItem={(entry) => <ResultRow event={eventOf(entry)} />}
        empty={
          <If when={hasQuery()}>
            <Text class="py-6 text-center text-sm text-muted-foreground">No events found.</Text>
          </If>
        }
      />
    </Dialog>
  )
}
