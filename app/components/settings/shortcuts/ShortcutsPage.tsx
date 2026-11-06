import { cleanup, computed, type JSX, signal, Text, token, View } from "nsh"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { formatHotkeyKey, ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip } from "@/components/ui/tooltip"

import { api, getErrorMessage, type KeyEdit } from "@/lib/api"
import { COMMAND_GROUPS, describeAction } from "@/lib/commands"
import {
  bindKeyEdits,
  canonicalKeys,
  isCustomized,
  resetActionEdits,
  unbindKeyEdits,
} from "@/lib/key-bindings"
import { toast } from "@/lib/toast"

import { CloseIcon, PlusIcon, SearchIcon, UndoIcon } from "@/icons"
import {
  bindings,
  commandValues,
  defaultBindings,
  keyErrors,
  userBindings,
} from "@/stores/commands"

import { actionRows } from "./action-rows"
import { captureKeys } from "./key-capture"

const displayKeys = (keys: string) => keys.split("+").map(formatHotkeyKey).join("+")

export function ShortcutsPage() {
  const query = signal("")
  const capturing = signal<string | null>(null)

  const rows = computed(() => actionRows(commandValues(), bindings()))
  const keysFor = (action: string) =>
    bindings()
      .filter((binding) => binding.action === action)
      .map((binding) => binding.keys)
  const filteredRows = computed(() => {
    const normalized = query().trim().toLowerCase()
    if (!normalized) return rows()
    return rows().filter(
      (row) =>
        row.label.toLowerCase().includes(normalized) ||
        keysFor(row.action).some((keys) => keys.includes(normalized)),
    )
  })

  const save = async (edits: KeyEdit[], message?: string) => {
    if (edits.length === 0) return
    try {
      await api.keys.edit(edits)
      if (message) toast(message)
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save keys.toml"))
    }
  }

  const label = (action: string) => describeAction(action, commandValues())?.label ?? action

  const bind = (action: string, keys: string) => {
    capturing.set(null)
    const previous = bindings().find(
      (binding) => canonicalKeys(binding.keys) === canonicalKeys(keys),
    )
    const moved =
      previous && previous.action !== action
        ? `${displayKeys(keys)} now runs “${label(action)}” instead of “${label(previous.action)}”`
        : undefined
    void save(bindKeyEdits(keys, action, defaultBindings(), userBindings()), moved)
  }

  return (
    <SettingsContent contentClass="max-w-[640px]">
      <View class="flex-row items-center">
        <View class="absolute left-3">
          <SearchIcon class="size-4" color={token("muted-foreground")} />
        </View>
        <Input
          variant="default"
          class="pl-9 pr-3"
          accessibilityLabel="Filter shortcuts"
          placeholder="Filter shortcuts"
          value={query()}
          onChange={({ value }) => query.set(value)}
        />
      </View>

      <If when={keyErrors().length > 0}>
        <View class="gap-1">
          <Each of={keyErrors()}>
            {(error) => <Text class="text-sm text-destructive">{error()}</Text>}
          </Each>
        </View>
      </If>

      <Each of={COMMAND_GROUPS}>
        {(group) => {
          const groupRows = () => filteredRows().filter((row) => row.group === group())
          return (
            <If when={groupRows().length > 0}>
              <View>
                <Text class="pb-1 text-sm font-semibold text-foreground">{group()}</Text>
                <Each of={groupRows()} key={(row) => row.action}>
                  {(row) => (
                    <ShortcutRow
                      label={row().label}
                      keys={keysFor(row().action)}
                      customized={isCustomized(row().action, defaultBindings(), bindings())}
                      capturing={capturing() === row().action}
                      onStartCapture={() => capturing.set(row().action)}
                      onCancelCapture={() => capturing.set(null)}
                      onCapture={(keys) => bind(row().action, keys)}
                      onRemove={(keys) =>
                        void save(unbindKeyEdits(keys, defaultBindings(), userBindings()))
                      }
                      onReset={() =>
                        void save(resetActionEdits(row().action, defaultBindings(), userBindings()))
                      }
                    />
                  )}
                </Each>
              </View>
            </If>
          )
        }}
      </Each>

      <If when={filteredRows().length === 0}>
        <Text class="py-10 text-center text-sm text-muted-foreground">No shortcuts found</Text>
      </If>

      <Text class="text-xs text-muted-foreground">Saved to ~/.config/rencal/keys.toml</Text>
    </SettingsContent>
  )
}

function ShortcutRow(props: {
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
    <View class="min-h-11 flex-row items-center justify-between gap-4 border-b border-border py-1.5">
      <Text class="text-sm">{props.label}</Text>

      <View class="shrink-0 flex-row flex-wrap items-center justify-end gap-1.5">
        <Each of={props.keys}>
          {(key) => (
            <View class="flex-row items-center gap-0.5 rounded-(--radius-md) bg-hover py-0.5 pl-1 pr-0.5">
              <ShortcutKeys keys={key()} />
              <RowButton
                label={`Remove ${displayKeys(key())} from ${props.label}`}
                onPress={() => props.onRemove(key())}
              >
                <CloseIcon class="size-3" color={token("muted-foreground")} />
              </RowButton>
            </View>
          )}
        </Each>

        <If
          when={props.capturing}
          else={
            <If when={props.keys.length === 0}>
              <Text class="text-xs text-muted-foreground">None</Text>
            </If>
          }
        >
          <KeyCapture onCapture={props.onCapture} onCancel={props.onCancelCapture} />
        </If>

        <RowButton label={`Add a key for ${props.label}`} onPress={props.onStartCapture}>
          <PlusIcon class="size-4" />
        </RowButton>
        <If when={props.customized}>
          <RowButton label="Restore default keys" onPress={props.onReset}>
            <UndoIcon class="size-4" />
          </RowButton>
        </If>
      </View>
    </View>
  )
}

function RowButton(props: { label: string; onPress: () => void; children?: JSX.Element }) {
  return (
    <View tooltip={<Tooltip label={props.label} delay={600} />}>
      <Button variant="ghost" size="icon-xs" onPress={props.onPress}>
        {props.children}
      </Button>
    </View>
  )
}

// While it shows, the next key press (with its modifiers) is the binding. Escape
// cancels, as does pressing it.
function KeyCapture(props: { onCapture: (keys: string) => void; onCancel: () => void }) {
  cleanup(captureKeys(props.onCapture, props.onCancel))
  return (
    <Button size="xs" onPress={props.onCancel}>
      <Text class="text-xs text-primary-foreground">Press keys…</Text>
    </Button>
  )
}
