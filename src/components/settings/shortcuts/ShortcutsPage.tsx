import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatHotkeyKey } from "@/components/ui/shortcut-tooltip"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { KeyBindingsProvider, useKeyBindings } from "@/contexts/KeyBindingsContext"

import { api, type ExternalView, getErrorMessage, type KeyEdit } from "@/lib/api"
import {
  argValues,
  COMMAND_GROUPS,
  COMMANDS,
  type CommandDef,
  type CommandGroup,
  type CommandValues,
  describeAction,
} from "@/lib/commands"
import {
  type Binding,
  bindKeyEdits,
  canonicalKeys,
  isCustomized,
  keysFromEvent,
  resetActionEdits,
  unbindKeyEdits,
} from "@/lib/key-bindings"
import { logger } from "@/lib/logger"

import { CloseIcon } from "@/icons/close"
import { PlusIcon } from "@/icons/plus"
import { SearchIcon } from "@/icons/search"
import { UndoIcon } from "@/icons/undo"
import { BUILTIN_VIEWS } from "@/views/manifest"

interface ActionRow {
  action: string
  label: string
  group: CommandGroup
}

// Every action a key can run: each command, or each value of a command whose
// values are fixed or listed (views, units), plus whatever keys.toml binds.
function actionRows(values: CommandValues, bindings: readonly Binding[]): ActionRow[] {
  const actions = COMMANDS.flatMap((command: CommandDef) => {
    if (command.cliOnly) return []
    const arg = command.args?.[0]
    if (arg && (command.palette === "values" || arg.values)) {
      return argValues(command, arg, values).map((choice) => `${command.id}:${choice.value}`)
    }
    return [command.id]
  })
  for (const { action } of bindings) if (!actions.includes(action)) actions.push(action)
  return actions.flatMap((action) => {
    const described = describeAction(action, values)
    return described ? [{ action, ...described }] : []
  })
}

const displayKeys = (keys: string) => keys.split("+").map(formatHotkeyKey).join("+")

export function ShortcutsPage() {
  return (
    <KeyBindingsProvider>
      <ShortcutsEditor />
    </KeyBindingsProvider>
  )
}

function ShortcutsEditor() {
  const { bindings, defaults, userBindings, errors } = useKeyBindings()
  const [pluginViews, setPluginViews] = useState<readonly ExternalView[]>([])
  const [query, setQuery] = useState("")
  const [capturing, setCapturing] = useState<string | null>(null)

  // Plugin views get rows too; the window doesn't load their scripts.
  useEffect(() => {
    const subscription = api.notifications.listen("external-views-changed", (snapshot) =>
      setPluginViews(snapshot.views),
    )
    api.views
      .listExternal()
      .then((snapshot) => setPluginViews(snapshot.views))
      .catch((err: unknown) => logger.error("Failed to list plugin views", err))
    return subscription.unlisten
  }, [])

  const values = useMemo<CommandValues>(
    () => ({
      "view.switch": [...BUILTIN_VIEWS, ...pluginViews].map((view) => ({
        value: view.id,
        label: `Display ${view.name.toLowerCase()} view`,
      })),
    }),
    [pluginViews],
  )
  const rows = useMemo(() => actionRows(values, bindings), [values, bindings])

  const normalizedQuery = query.trim().toLowerCase()
  const keysFor = (action: string) =>
    bindings.filter((binding) => binding.action === action).map((binding) => binding.keys)
  const filteredRows = normalizedQuery
    ? rows.filter(
        (row) =>
          row.label.toLowerCase().includes(normalizedQuery) ||
          keysFor(row.action).some((keys) => keys.includes(normalizedQuery)),
      )
    : rows

  const save = async (edits: KeyEdit[], message?: string) => {
    if (edits.length === 0) return
    try {
      await api.keys.edit(edits)
      if (message) toast(message)
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't save keys.toml"))
    }
  }

  const label = (action: string) => describeAction(action, values)?.label ?? action

  const bind = (action: string, keys: string) => {
    setCapturing(null)
    const previous = bindings.find((binding) => canonicalKeys(binding.keys) === canonicalKeys(keys))
    const moved =
      previous && previous.action !== action
        ? `${displayKeys(keys)} now runs “${label(action)}” instead of “${label(previous.action)}”`
        : undefined
    void save(bindKeyEdits(keys, action, defaults, userBindings), moved)
  }

  return (
    <SettingsContent className="max-w-[640px]">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter shortcuts"
          aria-label="Filter shortcuts"
          variant="default"
          className="pr-3 pl-9"
        />
      </div>

      {errors.length > 0 && (
        <div className="text-destructive flex flex-col gap-1 text-sm" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {COMMAND_GROUPS.map((group) => {
        const groupRows = filteredRows.filter((row) => row.group === group)
        if (groupRows.length === 0) return null
        return (
          <section key={group} className="flex flex-col">
            <h3 className="text-foreground pb-1 text-sm font-semibold">{group}</h3>
            {groupRows.map((row) => (
              <ShortcutRow
                key={row.action}
                label={row.label}
                keys={keysFor(row.action)}
                customized={isCustomized(row.action, defaults, bindings)}
                capturing={capturing === row.action}
                onStartCapture={() => setCapturing(row.action)}
                onCancelCapture={() => setCapturing(null)}
                onCapture={(keys) => bind(row.action, keys)}
                onRemove={(keys) => void save(unbindKeyEdits(keys, defaults, userBindings))}
                onReset={() => void save(resetActionEdits(row.action, defaults, userBindings))}
              />
            ))}
          </section>
        )
      })}

      {filteredRows.length === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">No shortcuts found</p>
      )}

      <p className="text-muted-foreground text-xs">
        Saved to <code>~/.config/rencal/keys.toml</code>
      </p>
    </SettingsContent>
  )
}

function ShortcutRow({
  label,
  keys,
  customized,
  capturing,
  onStartCapture,
  onCancelCapture,
  onCapture,
  onRemove,
  onReset,
}: {
  label: string
  keys: readonly string[]
  customized: boolean
  capturing: boolean
  onStartCapture: () => void
  onCancelCapture: () => void
  onCapture: (keys: string) => void
  onRemove: (keys: string) => void
  onReset: () => void
}) {
  return (
    <div
      data-slot="shortcut-row"
      className="flex min-h-11 items-center justify-between gap-4 border-b py-1.5 text-sm"
    >
      <span>{label}</span>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {keys.map((key) => (
          <span
            key={key}
            className="bg-hover flex items-center gap-0.5 rounded-md py-0.5 pr-0.5 pl-1"
          >
            <ShortcutKeys keys={key} />
            <button
              type="button"
              aria-label={`Remove ${displayKeys(key)} from ${label}`}
              onClick={() => onRemove(key)}
              className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
            >
              <CloseIcon className="size-3" />
            </button>
          </span>
        ))}

        {capturing ? (
          <KeyCapture onCapture={onCapture} onCancel={onCancelCapture} />
        ) : (
          keys.length === 0 && <span className="text-muted-foreground text-xs">None</span>
        )}

        <RowButton label={`Add a key for ${label}`} onClick={onStartCapture}>
          <PlusIcon className="size-4" />
        </RowButton>
        {customized && (
          <RowButton label="Restore default keys" onClick={onReset}>
            <UndoIcon className="size-4" />
          </RowButton>
        )}
      </div>
    </div>
  )
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Focused while open: the next key press (with its modifiers) is the binding.
// Escape cancels, as does clicking elsewhere.
function KeyCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (keys: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])

  return (
    <button
      ref={ref}
      type="button"
      className="bg-primary text-primary-foreground rounded-md px-2 py-0.5 text-xs"
      onBlur={onCancel}
      onKeyDown={(event) => {
        // Kept from the settings window, which closes on Escape.
        event.preventDefault()
        event.stopPropagation()
        if (event.key === "Escape") {
          onCancel()
          return
        }
        const keys = keysFromEvent(event.nativeEvent)
        if (keys) onCapture(keys)
      }}
    >
      Press keys…
    </button>
  )
}
