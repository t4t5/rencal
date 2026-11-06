import { computed, signal, Text, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { MoreMenu } from "@/components/settings/MoreMenu"
import { ErrorText, SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MenuItem } from "@/components/ui/menu"

import { cn } from "@/lib/utils"

import { PlusIcon } from "@/icons"
import { calendars } from "@/stores/calendar"
import { groups as calendarGroups, setGroups } from "@/stores/settings"
import { displayCase } from "@/themes"

export const DEFAULT_GROUP = "default"

type ModalState = { mode: "create" } | { mode: "edit"; group: string }

export function GroupsColumn(props: {
  groups: string[]
  selectedGroup: string
  onSelect: (group: string) => void
}) {
  const modal = signal<ModalState | null>(null)
  const allSlugs = () => calendars().map((calendar) => calendar.slug)

  const createGroup = async (name: string) => {
    await setGroups({ ...calendarGroups(), [name]: allSlugs() })
    props.onSelect(name)
  }

  const renameGroup = async (oldName: string, newName: string) => {
    const next = { ...calendarGroups() }
    const slugs = next[oldName] ?? allSlugs()
    delete next[oldName]
    next[newName] = slugs
    await setGroups(next)
    if (props.selectedGroup === oldName) props.onSelect(newName)
  }

  const deleteGroup = async (group: string) => {
    const next = { ...calendarGroups() }
    delete next[group]
    await setGroups(next)
    if (props.selectedGroup === group) props.onSelect(DEFAULT_GROUP)
  }

  return (
    <SettingsContent
      class="w-[220px] flex-none border-r border-border"
      contentClass="gap-2 px-0 py-[15px]"
    >
      <View class="flex-row items-center justify-between px-(--layout-padding)">
        <Text class={cn("font-mono text-sm text-muted-foreground", displayCase())}>Groups</Text>
        <Button size="icon-xs" variant="ghost" onPress={() => modal.set({ mode: "create" })}>
          <PlusIcon class="size-4" />
        </Button>
      </View>

      <View class="gap-1 px-1">
        <Each of={props.groups}>
          {(group) => (
            <View class="group flex-row items-center">
              <BaseButton
                onPress={() => props.onSelect(group())}
                class={cn(
                  "min-w-0 flex-1 rounded-(--radius-md) px-2 py-2 hover:bg-hover",
                  group() === props.selectedGroup && "bg-secondary",
                )}
              >
                <Text
                  class={cn(
                    "truncate text-sm",
                    group() === props.selectedGroup
                      ? "text-secondary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {group() === DEFAULT_GROUP ? "Default" : group()}
                </Text>
              </BaseButton>
              <If when={group() !== DEFAULT_GROUP}>
                <View class="absolute right-1 opacity-0 group-hover:opacity-100">
                  <MoreMenu>
                    <MenuItem
                      label="Edit"
                      onSelect={() => modal.set({ mode: "edit", group: group() })}
                    />
                    <MenuItem
                      label="Delete"
                      destructive
                      onSelect={() => void deleteGroup(group())}
                    />
                  </MoreMenu>
                </View>
              </If>
            </View>
          )}
        </Each>
      </View>

      <If when={modal()}>
        {(state) => (
          <GroupModal
            groups={props.groups}
            initialName={editedGroup(state()) ?? ""}
            title={state().mode === "edit" ? "Edit group" : "New group"}
            onClose={() => modal.set(null)}
            onSubmit={(name) => {
              const edited = editedGroup(state())
              return edited === null ? createGroup(name) : renameGroup(edited, name)
            }}
          />
        )}
      </If>
    </SettingsContent>
  )
}

const editedGroup = (state: ModalState) => (state.mode === "edit" ? state.group : null)

export function groupNameError(normalizedName: string, existingNames: string[]) {
  if (normalizedName === DEFAULT_GROUP) return "Default is reserved."
  if (existingNames.includes(normalizedName)) return "A group with this name already exists."
  return null
}

function GroupModal(props: {
  groups: string[]
  initialName: string
  title: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const name = signal(props.initialName)
  const saving = signal(false)
  const trimmed = () => name().trim()
  const existing = computed(() => {
    const initial = props.initialName.trim().toLowerCase()
    return props.groups.map((group) => group.toLowerCase()).filter((group) => group !== initial)
  })
  const error = () => groupNameError(trimmed().toLowerCase(), existing())
  const canSubmit = () => !!trimmed() && !error() && !saving()

  const submit = async () => {
    if (!canSubmit()) return
    saving.set(true)
    try {
      await props.onSubmit(trimmed())
      props.onClose()
    } catch (e) {
      saving.set(false)
      throw e
    }
  }

  return (
    <Dialog
      open
      class="w-[425px]"
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>Choose a unique name for this calendar group.</DialogDescription>
      </DialogHeader>
      <View class="gap-2">
        <Input
          variant="default"
          autoFocus
          value={name()}
          invalid={!!error()}
          placeholder="Group name"
          onChange={({ value }) => name.set(value)}
          onSubmit={() => void submit()}
        />
        <ErrorText message={error()} />
      </View>
      <DialogFooter>
        <Button variant="ghost" label="Cancel" onPress={props.onClose} disabled={saving()} />
        <Button label="Save" onPress={() => void submit()} disabled={!canSubmit()} />
      </DialogFooter>
    </Dialog>
  )
}
