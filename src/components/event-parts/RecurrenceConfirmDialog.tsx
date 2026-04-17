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
  onClose,
  onApplyToAll,
  onApplyToThis,
}: {
  isOpen: boolean
  onClose: () => void
  onApplyToAll: () => void
  onApplyToThis: () => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit recurring event</DialogTitle>
          <DialogDescription>This event is part of a recurring series.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onApplyToThis}>
            Just this event
          </Button>
          <Button onClick={onApplyToAll}>All events</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
