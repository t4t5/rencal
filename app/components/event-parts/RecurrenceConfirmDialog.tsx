import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { isUserOrganizer } from "@/lib/event-utils"

import { calendars } from "@/stores/calendar"
import {
  closeDuplicateDialog,
  duplicateAll,
  duplicateFuture,
  duplicateThis,
  pendingDuplicate,
} from "@/stores/duplicate"
import {
  applyToAll,
  applyToFuture,
  applyToThis,
  closeEditDialog,
  isRuleChanged,
  pendingEdit,
} from "@/stores/recurrence"

function RecurrenceConfirmDialog(props: {
  isOpen: boolean
  canApplyToThis?: boolean
  canApplyToFuture?: boolean
  title?: string
  description?: string
  onClose: () => void
  onApplyToAll: () => void
  onApplyToFuture: () => void
  onApplyToThis: () => void
}) {
  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()} class="w-[576px]">
      <DialogHeader>
        <DialogTitle>{props.title ?? "Edit recurring event"}</DialogTitle>
        <DialogDescription>
          {props.description ?? "This event is part of a recurring series."}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <If when={props.canApplyToThis ?? true}>
          <Button variant="secondary" label="Only this event" onPress={props.onApplyToThis} />
        </If>
        <If when={props.canApplyToFuture ?? true}>
          <Button
            variant="secondary"
            label="This and future events"
            onPress={props.onApplyToFuture}
          />
        </If>
        <Button label="All events" onPress={props.onApplyToAll} />
      </DialogFooter>
    </Dialog>
  )
}

export function EditRecurrenceDialog() {
  const edit = () => pendingEdit()
  return (
    <RecurrenceConfirmDialog
      isOpen={edit() !== null}
      // A changed rule belongs to the series, not to a single occurrence.
      canApplyToThis={!edit() || !isRuleChanged(edit()!)}
      // Only the organizer can split a recurring series.
      canApplyToFuture={edit() ? isUserOrganizer(edit()!.current, calendars()) : true}
      onClose={closeEditDialog}
      onApplyToThis={() => void applyToThis()}
      onApplyToFuture={() => void applyToFuture()}
      onApplyToAll={() => void applyToAll()}
    />
  )
}

export function DuplicateRecurrenceDialog() {
  return (
    <RecurrenceConfirmDialog
      isOpen={pendingDuplicate() !== null}
      title="Duplicate recurring event"
      description="This event is part of a recurring series. Which events do you want to duplicate?"
      onClose={closeDuplicateDialog}
      onApplyToThis={duplicateThis}
      onApplyToFuture={duplicateFuture}
      onApplyToAll={() => void duplicateAll()}
    />
  )
}
