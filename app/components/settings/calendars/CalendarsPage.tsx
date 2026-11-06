import { computed, effect, signal, View } from "nsh"

import { groups } from "@/stores/settings"

import { CalendarsColumn } from "./CalendarsColumn"
import { DEFAULT_GROUP, GroupsColumn } from "./GroupsColumn"

export function CalendarsPage() {
  const groupNames = computed(() => [
    DEFAULT_GROUP,
    ...Object.keys(groups())
      .filter((name) => name !== DEFAULT_GROUP)
      .sort(),
  ])
  const selectedGroup = signal(DEFAULT_GROUP)

  effect(() => {
    if (!groupNames().includes(selectedGroup())) selectedGroup.set(DEFAULT_GROUP)
  })

  return (
    <View class="min-h-0 min-w-0 flex-1 flex-row">
      <GroupsColumn
        groups={groupNames()}
        selectedGroup={selectedGroup()}
        onSelect={(group) => selectedGroup.set(group)}
      />
      <CalendarsColumn selectedGroup={selectedGroup()} />
    </View>
  )
}
