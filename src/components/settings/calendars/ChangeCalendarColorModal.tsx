import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { Calendar } from "@/rpc/bindings"

import { hexToHue, hueToHex } from "@/lib/color-utils"

export function ChangeCalendarColorModal({
  calendar,
  onClose,
  onSubmit,
}: {
  calendar: Calendar
  onClose: () => void
  onSubmit: (color: string) => Promise<void>
}) {
  const initialHue = hexToHue(calendar.color)
  const [hue, setHue] = useState(initialHue)
  const [color, setColor] = useState(calendar.color ?? hueToHex(initialHue))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      await onSubmit(color)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  const changeHue = (nextHue: number) => {
    setHue(nextHue)
    setColor(hueToHex(nextHue))
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Change calendar color</DialogTitle>
            <DialogDescription>
              Choose a color for {calendar.name || calendar.slug}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <div className="size-8 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <input
              type="range"
              min="0"
              max="359"
              value={hue}
              aria-label="Calendar color hue"
              onChange={(event) => changeHue(Number(event.target.value))}
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#e05252,#e0e052,#52e052,#52e0e0,#5252e0,#e052e0,#e05252)] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save color"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
