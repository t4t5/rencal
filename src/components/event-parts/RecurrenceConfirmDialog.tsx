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
  title = "Edit recurring event",
  description = "This event is part of a recurring series.",
  onClose,
  onApplyToAll,
  onApplyToFuture,
  onApplyToThis,
}: {
  isOpen: boolean
  title?: string
  description?: string
  onClose: () => void
  onApplyToAll: () => void
  onApplyToFuture: () => void
  onApplyToThis: () => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onApplyToThis}>
            Only this event
          </Button>
          <Button variant="secondary" onClick={onApplyToFuture}>
            This and future events
          </Button>
          <Button onClick={onApplyToAll}>All events</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
