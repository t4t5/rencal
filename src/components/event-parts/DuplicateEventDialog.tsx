import { RecurrenceConfirmDialog } from "@/components/event-parts/RecurrenceConfirmDialog"

export function DuplicateEventDialog({
  open,
  onClose,
  onDuplicateThis,
  onDuplicateFuture,
  onDuplicateAll,
}: {
  open: boolean
  onClose: () => void
  onDuplicateThis: () => void
  onDuplicateFuture: () => void
  onDuplicateAll: () => void
}) {
  return (
    <RecurrenceConfirmDialog
      isOpen={open}
      title="Duplicate recurring event"
      description="This event is part of a recurring series. Which events do you want to duplicate?"
      onClose={onClose}
      onApplyToThis={onDuplicateThis}
      onApplyToFuture={onDuplicateFuture}
      onApplyToAll={onDuplicateAll}
    />
  )
}
