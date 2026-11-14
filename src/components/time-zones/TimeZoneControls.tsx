import { type ComponentProps, type ReactElement, useMemo, useRef, useState } from "react"

import { TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { MAX_EXTRA_TIME_ZONES, nowZoned, timeZoneCity } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"
import { GlobeIcon } from "@/icons/globe"
import { PlusIcon } from "@/icons/plus"

// What a wrapping trigger, like a tooltip's, passes down to its child.
type TriggerProps = ComponentProps<"button">

const PICKER_WIDTH = "w-80"

/** The extra zones, and the zones a pick can't be: the viewer's and the extra ones but `tzid`. */
function useZoneList(tzid?: string) {
  const { extraTimeZones, setExtraTimeZones } = useSettings()
  const viewerTzid = useViewerTzid()
  const taken = useMemo(
    () => [viewerTzid, ...extraTimeZones].filter((other) => other !== tzid),
    [viewerTzid, extraTimeZones, tzid],
  )
  // Offsets as they are today.
  const [now] = useState(nowZoned)
  return { extraTimeZones, setExtraTimeZones, taken, now }
}

/**
 * A "+" that opens a list of zones and adds the pick to `useDisplaySettings().extraTimeZones`.
 * Renders nothing once those are full.
 */
export function AddTimeZoneButton({ className, ...props }: TriggerProps) {
  const { extraTimeZones, setExtraTimeZones, taken, now } = useZoneList()
  const [open, setOpen] = useState(false)

  if (extraTimeZones.length >= MAX_EXTRA_TIME_ZONES) return null

  return (
    <TimeZonePicker
      at={now}
      open={open}
      onOpenChange={setOpen}
      exclude={taken}
      onSelect={(tzid) => void setExtraTimeZones([...extraTimeZones, tzid])}
      contentClassName={PICKER_WIDTH}
    >
      <button
        type="button"
        data-slot="time-zone-add"
        aria-label="Add time zone"
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent aria-expanded:bg-accent",
          className,
        )}
        {...props}
      >
        <PlusIcon className="size-3.5" />
      </button>
    </TimeZonePicker>
  )
}

/**
 * A menu on its only child, e.g. a zone's name, to change `tzid` in
 * `useDisplaySettings().extraTimeZones`, add another zone while there's room, or remove `tzid`.
 */
export function TimeZoneMenu({
  tzid,
  children,
  ...props
}: Omit<TriggerProps, "children"> & { tzid: string; children: ReactElement }) {
  const { extraTimeZones, setExtraTimeZones, taken, now } = useZoneList(tzid)
  const [picking, setPicking] = useState<"change" | "add" | null>(null)
  // The list opens once the menu has closed: the menu keeps focus until then, which would close it.
  const pickNext = useRef<"change" | "add" | null>(null)
  const takenAll = useMemo(() => [...taken, tzid], [taken, tzid])

  const pick = (next: string) =>
    void setExtraTimeZones(
      picking === "add"
        ? [...extraTimeZones, next]
        : extraTimeZones.map((other) => (other === tzid ? next : other)),
    )

  return (
    <DropdownMenu>
      <TimeZonePicker
        asAnchor
        value={picking === "change" ? tzid : undefined}
        at={now}
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        exclude={picking === "add" ? takenAll : taken}
        onSelect={pick}
        contentClassName={PICKER_WIDTH}
      >
        <DropdownMenuTrigger asChild {...props}>
          {children}
        </DropdownMenuTrigger>
      </TimeZonePicker>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => {
          if (!pickNext.current) return
          e.preventDefault()
          setPicking(pickNext.current)
          pickNext.current = null
        }}
      >
        <DropdownMenuItem onSelect={() => (pickNext.current = "change")}>
          <GlobeIcon />
          Change time zone
          <span className="ms-auto ps-4 text-muted-foreground">{timeZoneCity(tzid)}</span>
        </DropdownMenuItem>
        {extraTimeZones.length < MAX_EXTRA_TIME_ZONES && (
          <DropdownMenuItem onSelect={() => (pickNext.current = "add")}>
            <PlusIcon />
            Add time zone
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void setExtraTimeZones(extraTimeZones.filter((other) => other !== tzid))}
        >
          <CloseIcon />
          Remove time zone from list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
