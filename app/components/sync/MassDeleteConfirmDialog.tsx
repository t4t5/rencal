import { Text, View } from "nsh"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { cn } from "@/lib/utils"

import { calendarOf } from "@/stores/calendar"
import {
  cancelMassDelete,
  confirmMassDelete,
  discardMassDelete,
  pendingMassDelete,
} from "@/stores/sync"
import { typography } from "@/themes"

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

export function MassDeleteConfirmDialog() {
  const items = () => pendingMassDelete() ?? []
  const totalDeletes = () => items().reduce((sum, p) => sum + p.to_push_delete_count, 0)

  return (
    <Dialog
      open={pendingMassDelete() !== null}
      onOpenChange={(open) => {
        if (!open) cancelMassDelete()
      }}
    >
      <DialogHeader>
        <DialogTitle>Confirm large deletion</DialogTitle>
        <DialogDescription>
          Syncing would delete {plural(totalDeletes(), "event")} from{" "}
          {plural(items().length, "calendar")}. Continue?
        </DialogDescription>
      </DialogHeader>
      <View class="gap-1">
        <Each of={items()} key={(preview) => preview.calendar_slug}>
          {(preview) => (
            <View class="flex-row justify-between gap-4 rounded-(--radius-xs) border border-border p-2">
              <Text class={cn(typography.body(), "truncate")}>
                {calendarOf(preview().calendar_slug)?.name ?? preview().calendar_slug}
              </Text>
              <Text class={cn(typography.body(), "text-muted-foreground tabular-nums")}>
                {preview().to_push_delete_count}
              </Text>
            </View>
          )}
        </Each>
      </View>
      <DialogFooter>
        <Button variant="secondary" label="Cancel" autoFocus onPress={cancelMassDelete} />
        <Button
          variant="secondary"
          label="Restore events"
          onPress={() => void discardMassDelete()}
        />
        <Button
          variant="destructive"
          label={`Delete ${plural(totalDeletes(), "event")}`}
          onPress={() => void confirmMassDelete()}
        />
      </DialogFooter>
    </Dialog>
  )
}
