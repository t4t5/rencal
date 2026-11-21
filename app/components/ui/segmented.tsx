import { Text } from "nsh"
import { Tab, Tabs } from "nsh/base"

import { cn } from "@/lib/utils"

import { buttonSurface, controlSurface, typography } from "@/themes"

/** A choice of a few values side by side in a recessed well, the chosen one on a raised chip that slides to it. */
export function Segmented<T extends string>(props: {
  items: { value: T; title: string }[]
  value: T
  onChange: (value: T) => void
  class?: string
}) {
  return (
    <Tabs
      class={cn(
        "flex-row gap-0.5 rounded-(--radius-md) bg-background p-0.5",
        controlSurface(),
        props.class,
      )}
      // Drawn as a secondary button, a shade up to make up for the darker well; the
      // tabs set the height and the well wraps them.
      indicatorClass={cn(
        "inset-y-0.5 rounded-(--radius-sm) border border-button-border bg-secondary-hover",
        buttonSurface(),
      )}
    >
      <Each of={props.items} key={(item) => item.value}>
        {(item) => (
          <Tab
            selected={item().value === props.value}
            onPress={() => props.onChange(item().value)}
            class="group h-(--control-height-sm) items-center justify-center px-3"
          >
            <Text
              class={cn(
                typography.body(),
                "text-muted-foreground group-hover:text-foreground group-selected:text-secondary-foreground",
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
