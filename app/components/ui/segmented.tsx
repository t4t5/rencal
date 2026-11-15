import { Text } from "nsh"
import { Tab, Tabs } from "nsh/base"

import { cn } from "@/lib/utils"

import { displayCase } from "@/themes"

/** A choice of a few values side by side, the chosen one on a pill that slides to it. */
export function Segmented<T extends string>(props: {
  items: { value: T; title: string }[]
  value: T
  onChange: (value: T) => void
  class?: string
}) {
  return (
    <Tabs
      class={cn("h-6 flex-row rounded-(--radius-circle) bg-muted p-0.5", props.class)}
      indicatorClass="inset-y-0.5 rounded-(--radius-circle) bg-selected"
    >
      <Each of={props.items} key={(item) => item.value}>
        {(item) => (
          <Tab
            selected={item().value === props.value}
            onPress={() => props.onChange(item().value)}
            class="group items-center justify-center px-2.5"
          >
            <Text
              class={cn(
                "font-mono text-xs text-muted-foreground group-selected:text-selected-foreground",
                displayCase(),
              )}
            >
              {item().title}
            </Text>
          </Tab>
        )}
      </Each>
    </Tabs>
  )
}
