import { type JSX, signal, Text, token, View } from "nsh"

import { Combobox } from "@/components/ui/combobox"
import { Item, ItemContent, ItemMedia } from "@/components/ui/item"

import { DEFAULT_REMINDER_VALUES, humanDuration, reminderQueryValues } from "@/lib/reminders"
import { cn } from "@/lib/utils"

import { BellIcon } from "@/icons"

import { RemoveItemButton } from "./RemoveItemButton"

function HumanDuration(props: { mins: number }) {
  return (
    <View class="flex-row items-baseline gap-1.5">
      <Text class="text-sm text-foreground">{humanDuration(props.mins)}</Text>
      <If when={props.mins > 0}>
        <Text class="text-sm text-muted-foreground">before</Text>
      </If>
    </View>
  )
}

export function ReminderSelect(props: {
  reminders: number[]
  onSelect: (mins: number) => void
  onRemove: (mins: number) => void
  placeholder?: string
  addon?: JSX.Element
  variant?: "ghost" | "default"
  indentRows?: boolean
}) {
  const query = signal("")
  // The combobox filters by title, so a title carries what was typed: "2h" means
  // "2 hours", which it wouldn't find.
  const items = () => {
    const typed = query()
    return (typed ? reminderQueryValues(typed) : DEFAULT_REMINDER_VALUES).map((mins) => ({
      value: String(mins),
      title: `${typed} ${humanDuration(mins)}`.trim(),
    }))
  }
  const sorted = () => [...props.reminders].sort((a, b) => a - b)

  return (
    <View class="gap-1">
      <Combobox
        placeholder={props.placeholder ?? "Reminders"}
        variant={props.variant}
        items={items()}
        value={[]}
        query={query()}
        onQueryChange={(event) => query.set(event.query)}
        onChange={({ value }) => {
          const mins = Number(value[0])
          if (value.length > 0 && !props.reminders.includes(mins)) props.onSelect(mins)
          query.set("")
        }}
        prefix={
          props.addon === undefined ? <BellIcon color={token("muted-foreground")} /> : props.addon
        }
        renderItem={(item) => (
          <View class="px-2 py-1.5">
            <HumanDuration mins={Number(item.value)} />
          </View>
        )}
      />
      <Each of={sorted()}>
        {(mins) => (
          <Item variant="accent" class={cn(props.indentRows === false && "gap-0")}>
            <If when={props.indentRows !== false}>
              <ItemMedia />
            </If>
            <ItemContent>
              <HumanDuration mins={mins()} />
            </ItemContent>
            <RemoveItemButton onPress={() => props.onRemove(mins())} />
          </Item>
        )}
      </Each>
    </View>
  )
}
