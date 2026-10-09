import { t } from "@lingui/core/macro"
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

import { getErrorMessage, type Calendar } from "@/lib/api"

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
      setError(getErrorMessage(err, t`Failed to rename calendar`))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t`Rename calendar`}</DialogTitle>
            <DialogDescription>{t`Choose a new display name for this calendar.`}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              value={name}
              disabled={isSaving}
              onChange={(event) => setName(event.target.value)}
              placeholder={t`Calendar name`}
              aria-invalid={!trimmedName || !!error}
            />
            {!trimmedName && (
              <p className="text-sm text-destructive">{t`Enter a calendar name.`}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={!trimmedName || isSaving}>
              {isSaving ? t`Saving...` : t`Save`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
