import { t } from "@lingui/core/macro"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function RecurrenceConfirmDialog({
  isOpen,
  canApplyToFuture = true,
  title,
  description,
  onClose,
  onApplyToAll,
  onApplyToFuture,
  onApplyToThis,
}: {
  isOpen: boolean
  canApplyToFuture?: boolean
  title?: string
  description?: string
  onClose: () => void
  onApplyToAll: () => void
  onApplyToFuture: () => void
  onApplyToThis: () => void
}) {
  const shownTitle = title ?? t`Edit recurring event`
  const shownDescription = description ?? t`This event is part of a recurring series.`

  return (
    <Dialog open={isOpen} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shownTitle}</DialogTitle>
          <DialogDescription>{shownDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onApplyToThis}>
            {t`Only this event`}
          </Button>
          {canApplyToFuture && (
            <Button variant="secondary" onClick={onApplyToFuture}>
              {t`This and future events`}
            </Button>
          )}
          <Button onClick={onApplyToAll}>{t`All events`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
