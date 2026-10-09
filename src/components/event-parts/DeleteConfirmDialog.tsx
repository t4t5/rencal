import { t } from "@lingui/core/macro"
import { type ReactNode, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { CalendarEvent } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

// Stands in for the styled event name inside a translated sentence, so the
// whole sentence stays one message and the name keeps its markup.
const NAME_SLOT = "\u0000name\u0000"

function withName(text: string, name: ReactNode): ReactNode {
  const [before, after = ""] = text.split(NAME_SLOT)
  return (
    <>
      {before}
      {name}
      {after}
    </>
  )
}

type DeleteConfirmDialogProps = {
  /** The event to confirm deleting; null closes the dialog. */
  event: CalendarEvent | null
  onClose: () => void
  onDeleteThis: () => void
  onDeleteFuture: () => void
  onDeleteAll: () => void
}

export function DeleteConfirmDialog({
  event,
  onClose,
  onDeleteThis,
  onDeleteFuture,
  onDeleteAll,
}: DeleteConfirmDialogProps) {
  // Keep showing the last event while the close animation runs.
  const [shown, setShown] = useState(event)
  if (event && event !== shown) setShown(event)

  const isRecurring = !!(shown?.recurring_event_id || shown?.recurrence)
  const name = shown?.summary ? (
    <span className="font-medium text-foreground">“{shown.summary}”</span>
  ) : null
  const eventName = NAME_SLOT

  return (
    <Dialog open={event !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(isRecurring && "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>{isRecurring ? t`Delete recurring event` : t`Delete event`}</DialogTitle>
          <DialogDescription>
            {isRecurring
              ? name
                ? withName(
                    t`The event ${eventName} is part of a recurring series. Which events do you want to delete?`,
                    name,
                  )
                : t`This event is part of a recurring series. Which events do you want to delete?`
              : name
                ? withName(t`Are you sure you want to delete the event ${eventName}?`, name)
                : t`Are you sure you want to delete this event?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          {isRecurring ? (
            <>
              <Button variant="secondary" onClick={onDeleteThis}>
                {t`Only this event`}
              </Button>
              <Button variant="destructive" onClick={onDeleteFuture}>
                {t`This and future events`}
              </Button>
              <Button variant="destructive" onClick={onDeleteAll}>
                {t`All events`}
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={onDeleteThis}>
              {t`Delete`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
