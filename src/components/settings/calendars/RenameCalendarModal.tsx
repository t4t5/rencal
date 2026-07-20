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
import { Input } from "@/components/ui/input"

import type { Calendar } from "@/rpc/bindings"

export function RenameCalendarModal({
  calendar,
  onClose,
  onSubmit,
}: {
  calendar: Calendar
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(calendar.name ?? calendar.slug)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const trimmedName = name.trim()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedName || isSaving) return

    setError(null)
    setIsSaving(true)
    try {
      await onSubmit(trimmedName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename calendar")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename calendar</DialogTitle>
            <DialogDescription>Choose a new display name for this calendar.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              value={name}
              disabled={isSaving}
              onChange={(event) => setName(event.target.value)}
              placeholder="Calendar name"
              aria-invalid={!trimmedName || !!error}
            />
            {!trimmedName && <p className="text-sm text-destructive">Enter a calendar name.</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmedName || isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
