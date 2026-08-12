import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { cn } from "@/lib/utils"

type DeleteConfirmDialogProps = {
  open: boolean
  isRecurring: boolean
  onClose: () => void
  onDeleteThis: () => void
  onDeleteFuture: () => void
  onDeleteAll: () => void
}

export function DeleteConfirmDialog({
  open,
  isRecurring,
  onClose,
  onDeleteThis,
  onDeleteFuture,
  onDeleteAll,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(isRecurring && "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>{isRecurring ? "Delete recurring event" : "Delete event"}</DialogTitle>
          <DialogDescription>
            {isRecurring
              ? "This event is part of a recurring series. Which events do you want to delete?"
              : "Are you sure you want to delete this event?"}
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
