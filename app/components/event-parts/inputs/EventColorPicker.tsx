import { View } from "nsh"

import { Button } from "@/components/ui/button"
import { Menu, MenuItem } from "@/components/ui/menu"
import { Tooltip } from "@/components/ui/tooltip"

import type { Calendar } from "@/lib/api"
import { EVENT_COLORS } from "@/lib/event-colors"
import { eventPaint } from "@/lib/event-paint"

import { CheckIcon } from "@/icons"

// Swatches show the raw colours Google will show, not a theme's event color.
function Swatch(props: { color: string; selected?: boolean }) {
  return (
    <View
      class="size-5 items-center justify-center rounded-full"
      style={{ backgroundColor: props.color }}
    >
      <If when={props.selected}>
        <CheckIcon class="size-3.5" color="#ffffff" />
      </If>
    </View>
  )
}

export function EventColorPicker(props: {
  color: string | null
  calendar?: Calendar
  onChange: (color: string | null) => void
}) {
  const selected = () =>
    EVENT_COLORS.find((c) => c.hex.toLowerCase() === props.color?.toLowerCase())
  const calendarColor = () => eventPaint(props.calendar?.color ?? null).color
  const options = () => [
    { name: "Calendar color", hex: null, swatch: calendarColor() },
    ...EVENT_COLORS.map((c) => ({ ...c, swatch: c.hex })),
  ]

  return (
    <Menu
      placement="bottom"
      align="end"
      popupClass="w-[232px] flex-row flex-wrap gap-1 p-2"
      trigger={
        <Button variant="ghost" size="icon">
          <View
            class="size-3.5 rounded-full"
            style={{ backgroundColor: selected()?.hex ?? calendarColor() }}
          />
        </Button>
      }
    >
      <Each of={options()} key={(option) => option.name}>
        {(option) => (
          <View tooltip={<Tooltip label={option().name} />}>
            <MenuItem
              class="size-8 items-center justify-center p-0"
              onSelect={() => props.onChange(option().hex)}
            >
              <Swatch
                color={option().swatch}
                selected={option().hex === (selected()?.hex ?? null)}
              />
            </MenuItem>
          </View>
        )}
      </Each>
    </Menu>
  )
}
