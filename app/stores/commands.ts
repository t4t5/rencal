/*
 * What runs commands: keys, the palette, the native menu and `rencal do` all
 * come through `runCommand`. `lib/commands.ts` lists them, `lib/key-bindings.ts`
 * their default keys; keys.toml comes in here.
 */
import { Temporal } from "@js-temporal/polyfill"
import { computed, signal, untracked } from "nsh"

import { getLastEventEndTime } from "@/lib/active-day-draft"
import { api, getErrorMessage, type KeysSnapshot, type UserKeyBinding } from "@/lib/api"
import { respondToCommand, takePendingCommands, type CommandOutcome } from "@/lib/api/internal"
import { formatGroupName, getGroupOptions } from "@/lib/calendar-groups"
import {
  argValues,
  COMMANDS,
  CommandError,
  type CommandId,
  type CommandValues,
  type Invocation,
  parseAction,
  resolveInvocation,
} from "@/lib/commands"
import {
  addMinutes,
  atTime,
  dateInViewerZone,
  DEFAULT_DURATION_MINS,
  getViewerTzid,
  today,
} from "@/lib/event-time"
import { type Binding, DEFAULT_BINDINGS, resolveBindings } from "@/lib/key-bindings"
import { logger } from "@/lib/logger"
import { parseEventText } from "@/lib/magic-parser"

import { clearAgendaSelection, selectedEvent, stepAgendaSelection } from "@/stores/agenda"
import { activeDate, activeGroup, navigateToDate, setActiveGroup } from "@/stores/calendar"
import {
  canCreate,
  draftPopoverOpen,
  openDraftPopover,
  promptToConnect,
  startDrafting,
} from "@/stores/draft"
import { triggerDuplicate } from "@/stores/duplicate"
import { activeEvent, calendarEvents, setActiveEventKey } from "@/stores/events"
import { toggleInvites } from "@/stores/invites"
import { clearPopoverAnchor } from "@/stores/popover"
import { groups, setShowWeekNumbers, showWeekNumbers } from "@/stores/settings"
import { syncNow } from "@/stores/sync"
import { setCalendarView, setSettingsOpen, settingsOpen, toggleSidebar } from "@/stores/view"
import { activeTheme, cycleTheme, pickTheme, themeDescriptors } from "@/themes/controller"
import { viewBindings, VIEWS } from "@/views/manifest"

const NAV_THROTTLE_MS = 80

export type CommandSource = "key" | "menu" | "palette" | "cli"
type CommandContext = { source: CommandSource }
type CommandArgs = Partial<Record<string, string>>
// A command's result is returned to `rencal do`, which prints it.
type CommandHandler = (args: CommandArgs, ctx: CommandContext) => unknown

// "root", or the command whose missing argument is being asked for.
export type PalettePage = "root" | CommandId

const paletteVisible = signal(false)
const page = signal<PalettePage>("root")
const searchVisible = signal(false)
const shortcutsVisible = signal(false)

export const paletteOpen = () => paletteVisible()
export const palettePage = () => page()
export const setPalettePage = (next: PalettePage) => page.set(next)
export const searchOpen = () => searchVisible()
export const shortcutsOpen = () => shortcutsVisible()
export const setSearchOpen = (open: boolean) => searchVisible.set(open)
export const setShortcutsOpen = (open: boolean) => shortcutsVisible.set(open)
export const setPaletteOpen = (open: boolean) => paletteVisible.set(open)

// keys.toml's entries as written, and why the file couldn't be read.
const userEntries = signal<readonly UserKeyBinding[]>([])
const fileError = signal<string | null>(null)
const keystrokeErrors = signal<readonly string[]>([])

export const defaultBindings = computed(() => [...viewBindings(VIEWS), ...DEFAULT_BINDINGS])
const resolved = computed(() => resolveBindings(defaultBindings(), userEntries()))

export const bindings = (): readonly Binding[] => resolved().bindings
export const userBindings = () => userEntries()

/** Problems in keys.toml ("keys.toml: ..."): it couldn't be read, or an entry was skipped. */
export const keyErrors = computed(() => {
  const entries = resolved().errors.map((error) => `keys.toml: ${error}`)
  const file = fileError()
  return [...(file ? [file] : []), ...entries, ...keystrokeErrors()]
})

/** Keys NSH refused when they were bound, reported with keys.toml's own problems. */
export const setKeystrokeErrors = (errors: readonly string[]) => keystrokeErrors.set(errors)

/** The keys shown for `action` (in a tooltip): its first listed binding. */
export const actionKeys = (action: string) =>
  bindings().find((binding) => binding.action === action && !binding.hidden)?.keys

export function loadKeyBindings() {
  // A file that can't be read keeps the last good bindings.
  const apply = (snapshot: KeysSnapshot) => {
    fileError.set(snapshot.error)
    if (!snapshot.error) userEntries.set(snapshot.bindings)
  }
  const subscription = api.notifications.listen("keys-changed", apply)
  void api.keys
    .get()
    .then(apply)
    .catch((error: unknown) => logger.error("Failed to load keys.toml", error))
  return subscription.unlisten
}

export const commandValues = computed(
  (): CommandValues => ({
    "view.switch": VIEWS.map((view) => ({
      value: view.id,
      label: `Display ${view.name.toLowerCase()} view`,
    })),
    "group.switch": getGroupOptions(groups()).map((name) => ({
      value: name,
      label: formatGroupName(name),
    })),
    "theme.set": themeDescriptors().map((theme) => ({ value: theme.id, label: theme.name })),
  }),
)

/** The value a prompt's list marks as current, by command. */
export const currentValues = computed(
  (): Partial<Record<CommandId, string>> => ({
    "group.switch": activeGroup(),
    "theme.set": activeTheme(),
  }),
)

export const eventOpen = () => !!activeEvent() || draftPopoverOpen()

/** Something modal covers the calendar: only keys that work anywhere reach it. */
export const calendarCovered = () =>
  paletteVisible() || searchVisible() || shortcutsVisible() || settingsOpen()

function openPalette(next: PalettePage) {
  page.set(next)
  paletteVisible.set(true)
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

let lastNav = 0

// Held keys repeat; other sources run every time. Returns the date shown.
function navigate(date: Temporal.PlainDate, ctx: CommandContext) {
  if (ctx.source === "key") {
    const now = Date.now()
    if (now - lastNav < NAV_THROTTLE_MS) return undefined
    lastNav = now
  }
  clearAgendaSelection()
  navigateToDate(date)
  return date.toString()
}

function stepped(direction: 1 | -1, unit: string | undefined): Temporal.PlainDate {
  const date = untracked(activeDate)
  if (unit === "day") return date.add({ days: direction })
  if (unit === "week") return date.add({ days: 7 * direction })
  // Months move between month starts.
  const monthStart = date.with({ day: 1 })
  if (direction === 1) return monthStart.add({ months: 1 })
  return date.equals(monthStart) ? monthStart.subtract({ months: 1 }) : monthStart
}

function newEventOnDay() {
  const date = untracked(activeDate)
  if (!untracked(canCreate)) {
    promptToConnect()
    throw new CommandError("No calendar can take new events yet")
  }
  const hour = Temporal.Now.zonedDateTimeISO(getViewerTzid()).hour
  const start = getLastEventEndTime(date, untracked(calendarEvents)) ?? atTime(date, hour)
  setActiveEventKey(null)
  clearPopoverAnchor()
  openDraftPopover({ start, end: addMinutes(start, DEFAULT_DURATION_MINS) })
}

function duplicateEvent() {
  if (untracked(draftPopoverOpen)) throw new CommandError("Finish the new event first")
  const target = untracked(activeEvent) ?? untracked(selectedEvent)
  if (!target) throw new CommandError("No event is selected")
  triggerDuplicate(target)
}

function nextGroup() {
  const options = getGroupOptions(untracked(groups))
  if (options.length < 2) throw new CommandError("There's only one calendar group")
  const activeIndex = options.indexOf(untracked(activeGroup))
  const next = options[activeIndex === -1 ? 0 : (activeIndex + 1) % options.length]!
  setActiveGroup(next)
  return next
}

// `app.commands`: what `rencal commands` prints, including keys.toml problems
// so whoever edits the file can check it.
function listCommands() {
  const values = untracked(commandValues)
  const commands = COMMANDS.map((command) => ({
    id: command.id,
    label: command.label,
    args: ("args" in command ? command.args : []).map((arg) => ({
      name: arg.name,
      description: arg.description,
      required: "required" in arg && !!arg.required,
      values: argValues(command, arg, values).map((choice) => choice.value),
    })),
    keys: untracked(bindings).flatMap((binding) => {
      const action = parseAction(binding.action)
      return action.command === command.id && !binding.hidden
        ? [{ keys: binding.keys, value: action.value ?? null }]
        : []
    }),
  }))
  return { commands, keyErrors: untracked(keyErrors) }
}

const handlers: Record<CommandId, CommandHandler> = {
  "event.new-on-day": newEventOnDay,
  "event.duplicate": duplicateEvent,
  "search.open": () => searchVisible.set(true),
  "event.new": () => {
    if (!untracked(canCreate)) {
      promptToConnect()
      throw new CommandError("No calendar can take new events yet")
    }
    startDrafting()
  },
  "invites.toggle": toggleInvites,
  "view.switch": ({ view }) => {
    if (view) setCalendarView(view)
  },
  "week-numbers.toggle": () => void setShowWeekNumbers(!untracked(showWeekNumbers)),
  "group.switch": ({ group }) => {
    if (group) setActiveGroup(group)
  },
  "group.next": nextGroup,
  "sidebar.toggle": () => toggleSidebar(),
  "date.go": ({ date }, ctx) => (date ? navigate(parseDateArg(date), ctx) : undefined),
  "date.today": () => {
    clearAgendaSelection()
    const date = today()
    navigateToDate(date)
    return date.toString()
  },
  "date.next": ({ unit }, ctx) => navigate(stepped(1, unit), ctx),
  "date.prev": ({ unit }, ctx) => navigate(stepped(-1, unit), ctx),
  "event.next": () => stepAgendaSelection(1),
  "event.prev": () => stepAgendaSelection(-1),
  "theme.set": ({ theme }) => {
    if (theme) pickTheme(theme)
  },
  "app.settings": () => setSettingsOpen(true),
  "app.shortcuts": () => shortcutsVisible.set(true),
  "theme.toggle": () => cycleTheme(),
  // `rencal do app.sync` waits for the sync to finish.
  "app.sync": () => syncNow(),
  "app.palette": () => {
    page.set("root")
    paletteVisible.update((open) => !open)
  },
  "app.commands": listCommands,
}

export function runCommand(invocation: Invocation, ctx: CommandContext): unknown {
  const { command, args, missing } = resolveInvocation(invocation, untracked(commandValues))
  if (untracked(eventOpen) && !("allowWhileEventOpen" in command && command.allowWhileEventOpen)) {
    if (ctx.source === "cli") throw new CommandError("Close the open event in renCal first")
    return undefined
  }
  if (missing) {
    // People are asked; programs are told what's missing.
    if (ctx.source === "cli") {
      throw new CommandError(`${command.id} needs ${missing.name}: ${missing.description}`)
    }
    openPalette(command.id)
    return undefined
  }
  return handlers[command.id](args, ctx)
}

// Keys, the menu and the palette have nowhere to show a failure; `rencal do` does.
export function runSafely(invocation: Invocation, source: Exclude<CommandSource, "cli">) {
  try {
    void Promise.resolve(runCommand(invocation, { source })).catch((error: unknown) =>
      logger.warn(`${invocation.command} failed`, error),
    )
  } catch (error) {
    if (error instanceof CommandError) logger.debug(`${invocation.command}: ${error.message}`)
    else logger.warn(`${invocation.command} failed`, error)
  }
}

// Runs `rencal do` requests: the queue is drained at start and whenever the
// backend signals a new one.
async function drainCommands() {
  const respond = (id: number, outcome: CommandOutcome) =>
    respondToCommand(id, outcome).catch((error: unknown) =>
      logger.error("Failed to report a command's outcome", error),
    )

  for (const { id, invocation } of await takePendingCommands()) {
    try {
      const result = await runCommand(invocation, { source: "cli" })
      void respond(id, {
        status: "ok",
        result: result === undefined ? null : JSON.stringify(result),
      })
    } catch (error) {
      void respond(id, {
        status: "error",
        message: getErrorMessage(error, `${invocation.command} failed`),
      })
    }
  }
}

export function listenForCommands() {
  const drain = () =>
    void drainCommands().catch((error: unknown) => logger.error("Failed to take commands", error))
  const requests = api.notifications.listen("command-requested", drain)
  const menu = api.notifications.listen("menu-action", (action) =>
    runSafely({ command: action }, "menu"),
  )
  drain()
  return () => {
    requests.unlisten()
    menu.unlisten()
  }
}
