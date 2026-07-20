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

const DEFAULT_HUE = 220

function hexToHue(color: string | null) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return DEFAULT_HUE

  const red = Number.parseInt(color.slice(1, 3), 16) / 255
  const green = Number.parseInt(color.slice(3, 5), 16) / 255
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  if (delta === 0) return DEFAULT_HUE
  if (max === red) return Math.round(60 * (((green - blue) / delta) % 6) + 360) % 360
  if (max === green) return Math.round(60 * ((blue - red) / delta + 2))
  return Math.round(60 * ((red - green) / delta + 4))
}

function hueToHex(hue: number) {
  const saturation = 0.65
  const lightness = 0.55
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const secondary = chroma * (1 - Math.abs((section % 2) - 1))
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const offset = lightness - chroma / 2

  return `#${[red, green, blue]
    .map((component) =>
      Math.round((component + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

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
