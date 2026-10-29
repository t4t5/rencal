import { Temporal } from "@js-temporal/polyfill"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { TimeZoneSelect } from "@/components/event-parts/inputs/TimeZoneSelect"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { api, getErrorMessage, type AvailabilitySource } from "@/lib/api"

/**
 * The exact text someone gets, in a zone of your choosing (theirs), and a
 * button that copies it. The text comes from core, as `caldir free` prints it.
 */
export function CopyFreeTimesPopover({
  source,
  defaultTzid,
  disabled,
  children,
}: {
  source: AvailabilitySource | null
  defaultTzid: string
  disabled?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [tzid, setTzid] = useState(defaultTzid)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const calendarSlugs = useVisibleCalendarIds()

  const sourceKey = JSON.stringify([source, calendarSlugs])
  useEffect(() => {
    if (!open || !source) return
    let cancelled = false
    setError(null)
    api.availability
      .freeTimesText(source, calendarSlugs, tzid)
      .then((next) => !cancelled && setText(next))
      .catch((err: unknown) => {
        if (cancelled) return
        setText(null)
        setError(getErrorMessage(err, "Couldn't compute free times"))
      })
    return () => {
      cancelled = true
    }
    // `sourceKey` stands in for `source` and `calendarSlugs`.
  }, [open, sourceKey, tzid])

  const copy = async () => {
    if (text === null) return
    try {
      await navigator.clipboard.writeText(text)
      setOpen(false)
      toast.success("Copied free times")
    } catch (err) {
      toast.error("Couldn't copy", { description: getErrorMessage(err, "Clipboard unavailable") })
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setTzid(defaultTzid)
          setText(null)
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled || !source}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 flex flex-col gap-3">
        <TimeZoneSelect
          value={{ kind: "datetime_zoned", value: Temporal.Now.zonedDateTimeISO(tzid) }}
          onChange={setTzid}
        />
        <pre
          data-slot="availability-copy-preview"
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 font-mono text-xs select-text"
        >
          {error ?? text ?? "…"}
        </pre>
        <Button disabled={text === null} onClick={() => void copy()}>
          Copy
        </Button>
      </PopoverContent>
    </Popover>
  )
}
