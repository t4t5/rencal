import { RemoveItemButton } from "@/components/event-parts/inputs/RemoveItemButton"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent } from "@/components/ui/item"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import type { InstantSpan } from "@/lib/api"
import { formatDateKey, formatShortDate, formatWallclockTime } from "@/lib/event-time"

import { useAvailability } from "./AvailabilityContext"
import { CopyFreeTimesPopover } from "./CopyFreeTimesPopover"

export function SharePanel() {
  const { selections, removeSelection, clearSelections, setHoveredSelection } = useAvailability()
  const { timeFormat } = useSettings()
  const tzid = useViewerTzid()

  const time = (instant: InstantSpan["start"]) => {
    const zoned = instant.toZonedDateTimeISO(tzid)
    return formatWallclockTime(zoned.hour, zoned.minute, timeFormat)
  }
  const byDay = Map.groupBy(selections, (span) =>
    formatDateKey(span.start.toZonedDateTimeISO(tzid).toPlainDate()),
  )

  return (
    <div className="flex flex-col min-h-0 grow">
      <div className="flex flex-col gap-4 overflow-y-auto px-2 py-4 grow min-h-0">
        <p className="px-(--control-padding-inline) text-sm text-muted-foreground">
          Drag on the calendar to pick times.
        </p>

        {[...byDay.values()].map((spans) => {
          const date = spans[0].start.toZonedDateTimeISO(tzid).toPlainDate()
          return (
            <section key={formatDateKey(date)} className="flex flex-col gap-1">
              <span className="px-(--control-padding-inline) text-sm font-medium">
                {formatShortDate(date)}
              </span>
              {spans.map((span) => (
                <Item
                  key={span.start.toString()}
                  variant="accent"
                  className="cursor-default"
                  onPointerEnter={() => setHoveredSelection(span)}
                  onPointerLeave={() => setHoveredSelection(null)}
                  onFocus={() => setHoveredSelection(span)}
                  onBlur={() => setHoveredSelection(null)}
                >
                  <ItemContent className="tabular-nums">
                    {time(span.start)} – {time(span.end)}
                  </ItemContent>
                  <ItemActions>
                    <RemoveItemButton onClick={() => removeSelection(span)} />
                  </ItemActions>
                </Item>
              ))}
            </section>
          )
        })}
      </div>

      <div data-slot="availability-panel-footer" className="flex gap-2 p-4 border-t border-border">
        <CopyFreeTimesPopover
          source={{ kind: "ranges", ranges: [...selections], tzid }}
          defaultTzid={tzid}
          disabled={selections.length === 0}
        >
          <Button variant="secondary">Copy times</Button>
        </CopyFreeTimesPopover>
        <div className="grow" />
        {selections.length > 0 && (
          <Button variant="ghost" onClick={clearSelections}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
