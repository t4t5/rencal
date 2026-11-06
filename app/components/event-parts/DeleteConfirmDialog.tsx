import { computed, Text } from "nsh"

import { Button } from "@/components/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import {
  closeDeleteDialog,
  deleteAll,
  deleteFuture,
  deleteTarget,
  deleteThis,
} from "@/stores/delete"

export function DeleteConfirmDialog() {
  // Keep showing the last event while the dialog leaves.
  const shown = computed<ReturnType<typeof deleteTarget>>((last) => deleteTarget() ?? last ?? null)
  const isRecurring = () => !!(shown()?.recurring_event_id || shown()?.recurrence)
  const name = () => shown()?.summary

  return (
    <Dialog
      open={deleteTarget() !== null}
      onOpenChange={(open) => !open && closeDeleteDialog()}
      class={isRecurring() ? "w-[576px]" : undefined}
    >
      <DialogHeader>
        <DialogTitle>{isRecurring() ? "Delete recurring event" : "Delete event"}</DialogTitle>
        <Text class="text-sm text-muted-foreground">
          {isRecurring()
            ? name()
              ? "The event "
              : "This event"
            : "Are you sure you want to delete "}
          <If when={name()}>
            <Text class="font-medium text-foreground">
              {isRecurring() ? `“${name()}”` : `the event “${name()}”`}
            </Text>
          </If>
          {!isRecurring() && !name() ? "this event" : ""}
          {isRecurring()
            ? " is part of a recurring series. Which events do you want to delete?"
            : "?"}
        </Text>
      </DialogHeader>
      <DialogFooter>
        <If
          when={isRecurring()}
          else={<Button variant="destructive" label="Delete" onPress={() => void deleteThis()} />}
        >
          <Button variant="secondary" label="Only this event" onPress={() => void deleteThis()} />
          <Button
            variant="destructive"
            label="This and future events"
            onPress={() => void deleteFuture()}
          />
          <Button variant="destructive" label="All events" onPress={() => void deleteAll()} />
        </If>
      </DialogFooter>
    </Dialog>
  )
}
