import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { rpc } from "@/rpc"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { logger } from "@/lib/logger"
import { cn } from "@/lib/utils"

const COLOR_PALETTE = [
  "#7986cb",
  "#33b679",
  "#8e24aa",
  "#e67c73",
  "#f6bf26",
  "#f4511e",
  "#039be5",
  "#0b8043",
]

export const LocalCalendarForm = ({ onClose }: { onClose: () => void }) => {
  const { reloadCalendars } = useCalendars()

  const [name, setName] = useState("")
  const [color, setColor] = useState(COLOR_PALETTE[0])
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError("Please enter a calendar name")
      return
    }

    setIsCreating(true)
    try {
      await rpc.caldir.create_local_calendar(trimmed, color)
      await reloadCalendars()
      onClose()
    } catch (err) {
      logger.error("Failed to create local calendar:", err)
      setError(err instanceof Error ? err.message : "Failed to create calendar")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 w-full">
      <Input
        ghost={false}
        type="text"
        placeholder="Calendar name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="flex flex-wrap justify-center gap-2">
        {COLOR_PALETTE.map((swatch) => {
          const selected = swatch === color
          return (
            <button
              key={swatch}
              type="button"
              aria-label={`Color ${swatch}`}
              aria-pressed={selected}
              onClick={() => setColor(swatch)}
              className={cn(
                "size-7 rounded-full transition-transform",
                "ring-offset-2 ring-offset-background",
                selected && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: swatch }}
            />
          )
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={isCreating || !name.trim()}>
          {isCreating ? "Creating..." : "Create calendar"}
        </Button>
      </div>
    </form>
  )
}
