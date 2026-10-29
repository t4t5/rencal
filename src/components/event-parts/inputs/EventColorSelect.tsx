import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import type { Calendar } from "@/lib/api"
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-styles"
import { EVENT_COLORS } from "@/lib/event-colors"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"

// Swatches show the raw colours Google will show, not a theme's `--event-color` override.
const Swatch = ({ color }: { color: string }) => (
  <div className="size-3 shrink-0 rounded-circle" style={{ backgroundColor: color }} />
)

export const EventColorSelect = ({
  color,
  calendar,
  onChange,
}: {
  color: string | null
  calendar?: Calendar
  onChange: (color: string | null) => void
}) => {
  const calendarColor = calendar?.color ?? DEFAULT_CALENDAR_COLOR
  const selected = EVENT_COLORS.find((c) => c.hex.toLowerCase() === color?.toLowerCase())

  const option = (name: string, hex: string | null, swatch: string) => (
    <DropdownMenuItem
      key={name}
      onSelect={() => onChange(hex)}
      className="gap-(--control-content-gap)"
    >
      <Swatch color={swatch} />
      <ItemContent className="text-sm">{name}</ItemContent>
      <CheckIcon className={cn(hex !== (selected?.hex ?? null) && "invisible")} />
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SelectMenuTrigger
          controlLayout
          aria-label={`Event color: ${selected?.name ?? "Calendar color"}`}
          className="shrink-0"
        >
          <ItemMedia>
            <Swatch color={selected?.hex ?? calendarColor} />
          </ItemMedia>
        </SelectMenuTrigger>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {option("Calendar color", null, calendarColor)}
        <DropdownMenuSeparator />
        {EVENT_COLORS.map((c) => option(c.name, c.hex, c.hex))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
