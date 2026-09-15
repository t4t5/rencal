import { useState } from "react"

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

  return (
    <Dialog open={event !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(isRecurring && "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>{isRecurring ? "Delete recurring event" : "Delete event"}</DialogTitle>
          <DialogDescription>
            {isRecurring ? (
              <>
                {name ? <>The event {name}</> : "This event"} is part of a recurring series. Which
                events do you want to delete?
              </>
            ) : (
              <>Are you sure you want to delete {name ? <>the event {name}</> : "this event"}?</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          {isRecurring ? (
            <>
              <Button variant="secondary" onClick={onDeleteThis}>
                Only this event
              </Button>
              <Button variant="destructive" onClick={onDeleteFuture}>
                This and future events
              </Button>
              <Button variant="destructive" onClick={onDeleteAll}>
                All events
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={onDeleteThis}>
              Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
