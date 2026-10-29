import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import type { Calendar } from "@/lib/api"
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-styles"
import { EVENT_COLORS } from "@/lib/event-colors"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"

// Swatches show the raw colours Google will show, not a theme's `--event-color` override.
const Swatch = ({ color, selected }: { color: string; selected?: boolean }) => (
  <span
    className={cn(
      "flex size-5 items-center justify-center rounded-full text-white outline-offset-2",
      selected && "outline-2",
    )}
    style={{ backgroundColor: color, outlineColor: selected ? color : undefined }}
  >
    {selected && <CheckIcon className="size-3.5 text-white" />}
  </span>
)

export const EventColorPicker = ({
  color,
  calendar,
  onChange,
}: {
  color: string | null
  calendar?: Calendar
  onChange: (color: string | null) => void
}) => {
  const selected = EVENT_COLORS.find((c) => c.hex.toLowerCase() === color?.toLowerCase())
  const options = [
    { name: "Calendar color", hex: null, swatch: calendar?.color ?? DEFAULT_CALENDAR_COLOR },
    ...EVENT_COLORS.map((c) => ({ ...c, swatch: c.hex })),
  ]

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Event color: ${selected?.name ?? "Calendar color"}`}
        >
          <span
            className="size-3.5 rounded-full"
            style={{ backgroundColor: selected?.hex ?? options[0].swatch }}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="grid min-w-0 grid-cols-6 gap-1 p-2">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.name}
            title={option.name}
            aria-label={option.name}
            onSelect={() => onChange(option.hex)}
            className="size-8 justify-center p-0"
          >
            <Swatch color={option.swatch} selected={option.hex === (selected?.hex ?? null)} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
