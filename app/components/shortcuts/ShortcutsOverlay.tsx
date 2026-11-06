import { computed, Scroll, signal, Text, View } from "nsh"
import { Sheet } from "nsh/base"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  COMMAND_GROUPS,
  type CommandGroup,
  type CommandValues,
  describeAction,
} from "@/lib/commands"
import type { Binding } from "@/lib/key-bindings"

import { CloseIcon, SearchIcon } from "@/icons"
import {
  bindings,
  commandValues,
  keyErrors,
  setShortcutsOpen,
  shortcutsOpen,
} from "@/stores/commands"

import { ShortcutKeys } from "./ShortcutKeys"

export interface ShortcutRowData {
  action: string
  label: string
  group: CommandGroup
  keys: string[]
}

/** One row per action, in the order its first binding comes. */
export function shortcutRows(list: readonly Binding[], values: CommandValues): ShortcutRowData[] {
  const rows = new Map<string, ShortcutRowData>()
  for (const binding of list) {
    if (binding.hidden) continue
    const row = rows.get(binding.action)
    if (row) {
      row.keys.push(binding.keys)
      continue
    }
    const described = describeAction(binding.action, values)
    if (described) {
      rows.set(binding.action, { action: binding.action, ...described, keys: [binding.keys] })
    }
  }
  return [...rows.values()]
}

function ShortcutRow(props: { row: () => ShortcutRowData }) {
  return (
    <View class="min-h-8 flex-row items-center justify-between gap-4">
      <Text class="flex-1 text-sm text-muted-foreground">{props.row().label}</Text>
      <View class="shrink-0 flex-row items-center gap-1.5">
        <Each of={props.row().keys}>
          {(keys, index) => (
            <View class="flex-row items-center gap-1.5">
              <If when={index() > 0}>
                <Text class="text-xs text-muted-foreground">or</Text>
              </If>
              <ShortcutKeys keys={keys()} />
            </View>
          )}
        </Each>
      </View>
    </View>
  )
}

function ShortcutGroupSection(props: { group: () => CommandGroup; rows: () => ShortcutRowData[] }) {
  const groupRows = () => props.rows().filter((row) => row.group === props.group())
  return (
    <If when={groupRows().length > 0}>
      <View class="gap-2">
        <Text class="text-sm font-semibold text-foreground">{props.group()}</Text>
        <Each of={groupRows()} key={(row) => row.action}>
          {(row) => <ShortcutRow row={row} />}
        </Each>
      </View>
    </If>
  )
}

export function ShortcutsOverlay() {
  const query = signal("")
  const rows = computed(() => shortcutRows(bindings(), commandValues()))
  const filtered = computed(() => {
    const normalized = query().trim().toLowerCase()
    if (!normalized) return rows()
    return rows().filter(
      (row) =>
        row.label.toLowerCase().includes(normalized) ||
        row.group.toLowerCase().includes(normalized) ||
        row.keys.some((keys) => keys.includes(normalized)),
    )
  })

  return (
    <Sheet
      open={shortcutsOpen()}
      side="right"
      onOpenChange={(event) => setShortcutsOpen(event.open)}
      onClose={() => query.set("")}
      backdropClass="bg-overlay"
      popupClass="w-[448px] max-w-full border-l border-border bg-background"
    >
      <View class="flex-1 min-h-0">
        <View class="shrink-0 gap-4 border-b border-border p-5">
          <View class="flex-row items-center justify-between gap-4">
            <Text class="text-lg font-semibold text-foreground">Keyboard shortcuts</Text>
            <Button variant="ghost" size="icon-xs" onPress={() => setShortcutsOpen(false)}>
              <CloseIcon class="size-4" />
            </Button>
          </View>
          <View class="h-(--control-height-lg) flex-row items-center gap-2 rounded-(--radius-md) bg-secondary px-3">
            <SearchIcon class="size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query()}
              onChange={(event) => query.set(event.value)}
              placeholder="Find keyboard shortcuts"
              accessibilityLabel="Find keyboard shortcuts"
              class="flex-1 border-0 bg-transparent px-0 focus:bg-transparent"
            />
          </View>
        </View>

        <Scroll class="flex-1 min-h-0" contentClass="px-5 py-4">
          <If when={keyErrors().length > 0}>
            <View class="mb-6 gap-1">
              <Each of={keyErrors()}>
                {(error) => <Text class="text-sm text-destructive">{error()}</Text>}
              </Each>
            </View>
          </If>

          <If
            when={filtered().length > 0}
            else={
              <Text class="py-10 text-center text-sm text-muted-foreground">
                No shortcuts found
              </Text>
            }
          >
            <View class="gap-7 pb-4">
              <Each of={COMMAND_GROUPS}>
                {(group) => <ShortcutGroupSection group={group} rows={filtered} />}
              </Each>
            </View>
          </If>

          <View class="border-t border-border pt-4">
            <Text class="text-xs text-muted-foreground">
              Change keys in <Text class="font-mono">~/.config/rencal/keys.toml</Text>.
            </Text>
          </View>
        </Scroll>
      </View>
    </Sheet>
  )
}
