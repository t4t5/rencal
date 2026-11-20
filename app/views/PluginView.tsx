import { Temporal } from "@js-temporal/polyfill"
import { cleanup, computed, nativeComponent, signal, View, type ViewRef } from "nsh"

import type { ExternalView } from "@/lib/api"
import { logger } from "@/lib/logger"
import type { DateRange } from "@/lib/types"

import {
  PLUGIN_API,
  type PluginRequest,
  type WireContext,
  type WireEvents,
  type WireNavigate,
  type WireTheme,
} from "@/sdk/protocol"
import { activeDate, calendars, navigateToDate, onNavigate, visibleSlugs } from "@/stores/calendar"
import { currentDay, viewerTzid } from "@/stores/clock"
import { draftText, isDrafting } from "@/stores/draft"
import { displayedEvents } from "@/stores/drag"
import { holdRange } from "@/stores/events"
import { pressEventAt } from "@/stores/popover"
import { extraTimeZones, firstDayOfWeek, showWeekNumbers, timeFormat } from "@/stores/settings"
import { appliedTheme } from "@/themes"
import { eventsInRange, toWireCalendar } from "@/views/plugin-wire"

type HostProps = {
  source: { bundle: string; pluginId: string }
  theme: WireTheme | null
  context: WireContext
  events: WireEvents | null
  navigate: WireNavigate | null
}

// `native/src/plugin_view.rs`: the plugin's bundle in an engine of its own.
const PluginHost = nativeComponent<HostProps, { request: PluginRequest }>("rencal.plugin-view", {
  props: ["source", "theme", "context", "events", "navigate"],
  events: ["request"],
})

/** A view plugin's NSH bundle, fed renCal's state and heard for what it asks. */
export function PluginView(props: { view: ExternalView & { bundle: string } }) {
  let area: ViewRef | undefined
  const held = signal<DateRange | null>(null)
  let release: (() => void) | undefined
  cleanup(() => release?.())

  const navigation = signal<WireNavigate | null>(null)
  let version = 0
  cleanup(onNavigate((date) => navigation.set({ date: date.toString(), version: ++version })))

  const context = computed((): WireContext => {
    const visible = new Set(visibleSlugs())
    return {
      api: PLUGIN_API,
      activeDate: activeDate().toString(),
      today: currentDay().toString(),
      viewerTzid: viewerTzid(),
      timeFormat: timeFormat(),
      firstDayOfWeek: firstDayOfWeek(),
      showWeekNumbers: showWeekNumbers(),
      extraTimeZones: extraTimeZones(),
      calendars: calendars().map((calendar) =>
        toWireCalendar(calendar, visible.has(calendar.slug)),
      ),
      dimmed: isDrafting() && draftText() !== "",
    }
  })

  const events = computed((): WireEvents | null => {
    const range = held()
    if (!range) return null
    return {
      start: range.start.toString(),
      end: range.end.toString(),
      events: eventsInRange(displayedEvents(), range, calendars()),
    }
  })

  async function request(message: PluginRequest) {
    switch (message.name) {
      case "goToDate":
        navigateToDate(Temporal.PlainDate.from(message.data.date))
        return
      case "holdRange": {
        const range = {
          start: Temporal.PlainDate.from(message.data.start),
          end: Temporal.PlainDate.from(message.data.end),
        }
        release?.()
        release = holdRange(range)
        held.set(range)
        return
      }
      case "openEvent": {
        const origin = (await area?.measure())?.pagePosition ?? { x: 0, y: 0 }
        const { x, y, width, height } = message.data.bounds
        await pressEventAt(message.data.key, {
          origin: { x: origin.x + x, y: origin.y + y },
          size: { width, height },
        })
        return
      }
    }
  }

  return (
    <View ref={area} class="flex-1 min-h-0">
      <PluginHost
        class="flex-1"
        source={{ bundle: props.view.bundle, pluginId: props.view.plugin_id }}
        theme={appliedTheme()}
        context={context()}
        events={events()}
        navigate={navigation()}
        onRequest={(message) => {
          request(message).catch((error: unknown) =>
            logger.error(`${props.view.id}: ${message.name} failed`, error),
          )
        }}
      />
    </View>
  )
}
