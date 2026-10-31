import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { CommandPalette, type PalettePage } from "@/components/shortcuts/CommandPalette"
import { ShortcutsOverlay } from "@/components/shortcuts/ShortcutsOverlay"
import {
  AGENDA_ITEM_SELECTOR,
  clearRememberedAgendaItem,
  focusAgendaItem,
  isAgendaItemFocused,
  isInteractiveElementFocused,
} from "@/components/sidebar/agenda/useAgendaKeyboardNav"
import { INVITES_BUTTON_EL_ID } from "@/components/toolbar/InvitesBadge"
import { openSettingsWindow } from "@/components/toolbar/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/toolbar/search/SearchButton"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useDuplicateEvent } from "@/contexts/DuplicateEventContext"
import { useEventDraft } from "@/contexts/EventDraftContext"
import { useKeyBindings } from "@/contexts/KeyBindingsContext"
import { useSettings } from "@/contexts/SettingsContext"
import { useSync } from "@/contexts/SyncContext"

import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { getLastEventEndTime } from "@/lib/active-day-draft"
import { api, getErrorMessage } from "@/lib/api"
import { respondToCommand, takePendingCommands, type CommandOutcome } from "@/lib/api/internal"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { formatGroupName, getGroupOptions } from "@/lib/calendar-groups"
import {
  argValues,
  COMMANDS,
  CommandError,
  type CommandId,
  type CommandValues,
  findCommand,
  type Invocation,
  parseAction,
  resolveInvocation,
} from "@/lib/commands"
import { largestDayElement } from "@/lib/day-grid"
import { dateInViewerZone, today } from "@/lib/event-time"
import { type Binding, isCharKey } from "@/lib/key-bindings"
import { logger } from "@/lib/logger"
import { parseEventText } from "@/lib/magic-parser"

import { useTheme } from "@/themes/ThemeController"
import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { useViews } from "@/views/useViews"

const NAV_THROTTLE_MS = 80

type CommandSource = "key" | "menu" | "palette" | "cli"

interface CommandContext {
  source: CommandSource
  event?: KeyboardEvent
}

type CommandArgs = Partial<Record<string, string>>

// A command's result is returned to `rencal do`, which prints it.
type CommandHandler = (args: CommandArgs, ctx: CommandContext) => unknown

type RunCommand = (invocation: Invocation, ctx: CommandContext) => unknown

// Isolated so context updates in the command handlers don't re-render <App />.
export function GlobalShortcuts({
  onChangeCalendarView,
  onToggleSidebar,
}: {
  onChangeCalendarView: (view: string) => void
  onToggleSidebar: () => void
}) {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePage, setPalettePage] = useState<PalettePage>("root")

  const { activeTheme, pickTheme, cycleTheme } = useTheme()
  const { descriptors } = useThemeRegistry()
  const { groups, showWeekNumbers, setShowWeekNumbers } = useSettings()
  const { activeGroup, setActiveGroup } = useCalendars()
  const { activeEvent } = useCalEvents()
  const { draftPopoverOpen } = useEventDraft()
  const { bindings, errors: keyErrors } = useKeyBindings()
  const views = useViews()

  const values: CommandValues = {
    "view.switch": views.map((view) => ({
      value: view.id,
      label: `Display ${view.name.toLowerCase()} view`,
    })),
    "group.switch": getGroupOptions(groups).map((name) => ({
      value: name,
      label: formatGroupName(name),
    })),
    "theme.set": descriptors.map((theme) => ({ value: theme.id, label: theme.name })),
  }
  const current: Partial<Record<CommandId, string>> = {
    "group.switch": activeGroup,
    "theme.set": activeTheme,
  }

  const openPalette = (page: PalettePage) => {
    setPalettePage(page)
    setPaletteOpen(true)
  }

  const handlers = useCommandHandlers({
    onChangeCalendarView,
    onToggleSidebar,
    openShortcutsOverlay: () => setOverlayOpen(true),
    togglePalette: () => {
      setPalettePage("root")
      setPaletteOpen((open) => !open)
    },
    setActiveGroup,
    pickTheme,
    cycleTheme,
    toggleWeekNumbers: () => void setShowWeekNumbers(!showWeekNumbers),
    listCommands: () => listCommands(bindings, keyErrors, values),
  })

  const eventOpen = !!activeEvent || draftPopoverOpen

  const run: RunCommand = (invocation, ctx) => {
    const { command, args, missing } = resolveInvocation(invocation, values)
    if (eventOpen && !command.allowWhileEventOpen) {
      // Unhandled keys keep their native behavior (Tab moves within the popover).
      if (ctx.source === "cli") throw new CommandError("Close the open event in renCal first")
      return undefined
    }
    if (missing) {
      // People are asked; programs are told what's missing.
      if (ctx.source === "cli") {
        throw new CommandError(`${command.id} needs ${missing.name}: ${missing.description}`)
      }
      ctx.event?.preventDefault()
      openPalette(command.id)
      return undefined
    }
    return handlers[command.id](args, ctx)
  }

  // Native and CLI requests arrive through subscriptions made once.
  const runRef = useRef(run)
  useLayoutEffect(() => {
    runRef.current = run
  })

  useEffect(() => {
    const subscription = api.notifications.listen("menu-action", (action) => {
      runSafely(runRef.current, { command: action }, { source: "menu" })
    })
    return subscription.unlisten
  }, [])

  useCommandRequests(runRef)

  return (
    <>
      {bindings.map((binding) => (
        <BindingHost
          key={binding.keys}
          binding={binding}
          onTrigger={(event) =>
            runSafely(run, { command: binding.action }, { source: "key", event })
          }
        />
      ))}

      <ShortcutsOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} values={values} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        requestedPage={palettePage}
        values={values}
        current={current}
        onRun={(action) => runSafely(run, { command: action }, { source: "palette" })}
      />
    </>
  )
}

// Keys, the menu and the palette have nowhere to show a failure; `rencal do` does.
function runSafely(run: RunCommand, invocation: Invocation, ctx: CommandContext) {
  try {
    void Promise.resolve(run(invocation, ctx)).catch((err: unknown) =>
      logger.warn(`${invocation.command} failed`, err),
    )
  } catch (err) {
    if (err instanceof CommandError) logger.debug(`${invocation.command}: ${err.message}`)
    else logger.warn(`${invocation.command} failed`, err)
  }
}

// Runs `rencal do` requests: the queue is drained on mount and whenever the
// backend signals a new one.
function useCommandRequests(runRef: { readonly current: RunCommand }) {
  useEffect(() => {
    const respond = (id: number, outcome: CommandOutcome) =>
      respondToCommand(id, outcome).catch((err: unknown) =>
        logger.error("Failed to report a command's outcome", err),
      )

    const drain = async () => {
      for (const { id, invocation } of await takePendingCommands()) {
        try {
          const result = await runRef.current(invocation, { source: "cli" })
          void respond(id, {
            status: "ok",
            result: result === undefined ? null : JSON.stringify(result),
          })
        } catch (err) {
          void respond(id, {
            status: "error",
            message: getErrorMessage(err, `${invocation.command} failed`),
          })
        }
      }
    }
    const drainSafely = () =>
      void drain().catch((err: unknown) => logger.error("Failed to take commands", err))

    const subscription = api.notifications.listen("command-requested", drainSafely)
    void subscription.ready.then(drainSafely)
    return subscription.unlisten
  }, [runRef])
}

// `app.commands`: what `rencal commands` prints, including keys.toml problems
// so whoever edits the file can check it.
function listCommands(
  bindings: readonly Binding[],
  keyErrors: readonly string[],
  values: CommandValues,
) {
  const commands = COMMANDS.map((command) => ({
    id: command.id,
    label: command.label,
    args: ("args" in command ? command.args : []).map((arg) => ({
      name: arg.name,
      description: arg.description,
      required: !!arg.required,
      values: argValues(command, arg, values).map((choice) => choice.value),
    })),
    keys: bindings.flatMap((binding) => {
      const action = parseAction(binding.action)
      return action.command === command.id && !binding.hidden
        ? [{ keys: binding.keys, value: action.value ?? null }]
        : []
    }),
  }))
  return { commands, keyErrors }
}

function parseDateArg(text: string): Temporal.PlainDate {
  try {
    return Temporal.PlainDate.from(text)
  } catch {
    const start = parseEventText(text).start
    if (!start) throw new CommandError(`Can't read "${text}" as a date`)
    return dateInViewerZone(start)
  }
}

function useCommandHandlers({
  onChangeCalendarView,
  onToggleSidebar,
  openShortcutsOverlay,
  togglePalette,
  setActiveGroup,
  pickTheme,
  cycleTheme,
  toggleWeekNumbers,
  listCommands,
}: {
  onChangeCalendarView: (view: string) => void
  onToggleSidebar: () => void
  openShortcutsOverlay: () => void
  togglePalette: () => void
  setActiveGroup: (name: string) => void
  pickTheme: (id: string) => void
  cycleTheme: () => void
  toggleWeekNumbers: () => void
  listCommands: () => unknown
}): Record<CommandId, CommandHandler> {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setSelectedEventKey, selectedEventKey } = useAgendaSelection()
  const { activeEvent, calendarEvents } = useCalEvents()
  const { draftPopoverOpen, setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { groups } = useSettings()
  const { activeGroup } = useCalendars()
  const { triggerDuplicate } = useDuplicateEvent()
  const { syncNow } = useSync()
  const openDayDraft = useOpenDayDraft()

  const lastNavRef = useRef(0)

  // Tab / Shift-Tab drive event navigation.
  // Defer to the browser's native Tab handling ONLY when focus
  // is genuinely inside a tabbable control
  const shouldDeferEventNav = (): boolean => {
    const active = document.activeElement as HTMLElement | null
    if (!isInteractiveElementFocused(active)) return false
    // tabIndex >= 0 → a real tab stop; leave it to the browser.
    if (active && active.tabIndex >= 0) return true
    active?.blur()
    return false
  }

  const clearAgendaFocus = () => {
    if (!isAgendaItemFocused()) return
    clearRememberedAgendaItem()
    setSelectedEventKey(null)
    const activeElement = document.activeElement as HTMLElement | null
    activeElement?.blur()
  }

  // Held keys repeat; other sources run every time. Returns the date shown.
  const navigate = (date: Temporal.PlainDate, ctx: CommandContext): string | undefined => {
    if (ctx.source === "key") {
      const now = Date.now()
      if (now - lastNavRef.current < NAV_THROTTLE_MS) return undefined
      lastNavRef.current = now
    }
    clearAgendaFocus()
    void navigateToDate(date)
    return date.toString()
  }

  const stepped = (direction: 1 | -1, unit: string | undefined): Temporal.PlainDate => {
    if (unit === "day") return activeDate.add({ days: direction })
    if (unit === "week") return activeDate.add({ days: 7 * direction })
    // Months move between month starts.
    const monthStart = activeDate.with({ day: 1 })
    if (direction === 1) return monthStart.add({ months: 1 })
    return activeDate.equals(monthStart) ? monthStart.subtract({ months: 1 }) : monthStart
  }

  const clickElement = (id: string, unavailable: string) => {
    const element = document.getElementById(id)
    if (!element) throw new CommandError(unavailable)
    element.click()
  }

  const handleDuplicateEvent: CommandHandler = (_args, { event }) => {
    event?.preventDefault()
    if (draftPopoverOpen) throw new CommandError("Finish the new event first")
    const target =
      activeEvent ??
      calendarEvents.find((calEvent) => eventKey(calEvent) === selectedEventKey) ??
      findFocusedAgendaEvent(calendarEvents)
    if (!target) throw new CommandError("No event is selected")
    triggerDuplicate(target)
  }

  return {
    "event.new-on-day": (_args, { event }) => {
      event?.preventDefault()
      const el = largestDayElement(activeDate)
      if (!el) throw new CommandError("The selected day isn't shown")
      openDayDraft(activeDate, el, { start: getLastEventEndTime(activeDate, calendarEvents) })
    },
    "event.duplicate": handleDuplicateEvent,
    "search.open": (_args, { event }) => {
      event?.preventDefault()
      clickElement(SEARCH_BUTTON_EL_ID, "Search isn't shown")
    },
    "event.new": (_args, { event }) => {
      event?.preventDefault()
      if (!canCreate) {
        promptToConnect()
        throw new CommandError("No calendar can take new events yet")
      }
      setDefaultDraftEvent()
      setIsDrafting(true)
    },
    "invites.toggle": (_args, { event }) => {
      event?.preventDefault()
      clickElement(INVITES_BUTTON_EL_ID, "There are no invitations")
    },
    "view.switch": ({ view }) => {
      if (view) onChangeCalendarView(view)
    },
    "week-numbers.toggle": () => toggleWeekNumbers(),
    "group.switch": ({ group }) => {
      if (group) setActiveGroup(group)
    },
    "group.next": (_args, { event }) => {
      const options = getGroupOptions(groups)
      if (options.length < 2) throw new CommandError("There's only one calendar group")
      event?.preventDefault()
      const activeIndex = options.indexOf(activeGroup)
      const next = options[activeIndex === -1 ? 0 : (activeIndex + 1) % options.length]
      setActiveGroup(next)
      return next
    },
    "sidebar.toggle": (_args, { event }) => {
      event?.preventDefault()
      onToggleSidebar()
    },
    "date.go": ({ date }, ctx) => (date ? navigate(parseDateArg(date), ctx) : undefined),
    "date.today": () => {
      clearAgendaFocus()
      const date = today()
      void navigateToDate(date)
      return date.toString()
    },
    "date.next": ({ unit }, ctx) => navigate(stepped(1, unit), ctx),
    "date.prev": ({ unit }, ctx) => navigate(stepped(-1, unit), ctx),
    "event.next": (_args, { event }) => {
      if (shouldDeferEventNav()) return
      event?.preventDefault()
      focusAgendaItem(1, activeDate)
    },
    "event.prev": (_args, { event }) => {
      if (shouldDeferEventNav()) return
      event?.preventDefault()
      focusAgendaItem(-1, activeDate)
    },
    "theme.set": ({ theme }) => {
      if (theme) pickTheme(theme)
    },
    "app.settings": (_args, { event }) => {
      event?.preventDefault()
      return openSettingsWindow().then(() => undefined)
    },
    "app.shortcuts": (_args, { event }) => {
      event?.preventDefault()
      openShortcutsOverlay()
    },
    "theme.toggle": (_args, { event }) => {
      event?.preventDefault()
      cycleTheme()
    },
    // `rencal do app.sync` waits for the sync to finish.
    "app.sync": () => syncNow(),
    "app.palette": (_args, { event }) => {
      event?.preventDefault()
      togglePalette()
    },
    "app.commands": () => listCommands(),
  }
}

// The agenda row under keyboard focus, if any, resolved to its event.
function findFocusedAgendaEvent(events: CalendarEvent[]): CalendarEvent | undefined {
  const active = document.activeElement as HTMLElement | null
  const key = active?.closest(AGENDA_ITEM_SELECTOR)?.getAttribute("data-event-key")
  if (!key) return undefined
  return events.find((event) => eventKey(event) === key)
}

function BindingHost({
  binding,
  onTrigger,
}: {
  binding: Binding
  onTrigger: (event: KeyboardEvent) => void
}) {
  const command = findCommand(parseAction(binding.action).command)
  return isCharKey(binding.keys) ? (
    <CharBindingHost char={binding.keys} onTrigger={onTrigger} />
  ) : (
    <HotkeyBindingHost
      keys={binding.keys}
      enableOnFormTags={command?.enableOnFormTags}
      onTrigger={onTrigger}
    />
  )
}

function HotkeyBindingHost({
  keys,
  enableOnFormTags,
  onTrigger,
}: {
  keys: string
  enableOnFormTags?: boolean
  onTrigger: (event: KeyboardEvent) => void
}) {
  useHotkeys(keys, onTrigger, { enableOnFormTags })
  return null
}

// Makes sure that single key shortcuts (like "C")
// work regardless of keyboard layout (QWERTY, AZERTY, etc)
function CharBindingHost({
  char,
  onTrigger,
}: {
  char: string
  onTrigger: (event: KeyboardEvent) => void
}) {
  // Letters with shift are other keys; symbols like "?" may need shift to type.
  const allowShift = !/[a-z]/.test(char)
  useHotkeys(
    char,
    (e) => {
      if (e.key.toLowerCase() !== char) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!allowShift && e.shiftKey) return
      onTrigger(e)
    },
    { useKey: true },
  )
  return null
}
