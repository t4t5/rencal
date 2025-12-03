import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type DeleteConfirmDialogProps = {
  open: boolean
  isRecurring: boolean
  onClose: () => void
  onDeleteThis: () => void
  onDeleteAll: () => void
}

export function DeleteConfirmDialog({
  open,
  isRecurring,
  onClose,
  onDeleteThis,
  onDeleteAll,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete event</DialogTitle>
          <DialogDescription>
            {isRecurring
              ? "This event is part of a recurring series. Which events do you want to delete?"
              : "Are you sure you want to delete this event?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {isRecurring ? (
            <>
              <Button onClick={onDeleteThis} variant="destructive">
                Delete This Event Only
              </Button>
              <Button onClick={onDeleteAll} variant="destructive">
                Delete All Events
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
