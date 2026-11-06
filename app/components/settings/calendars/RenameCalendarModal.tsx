import { signal, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { type Calendar, getErrorMessage } from "@/lib/api"

export function RenameCalendarModal(props: {
  calendar: Calendar
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const name = signal(props.calendar.name ?? props.calendar.slug)
  const error = signal<string | null>(null)
  const saving = signal(false)
  const trimmed = () => name().trim()

  const submit = async () => {
    if (!trimmed() || saving()) return
    error.set(null)
    saving.set(true)
    try {
      await props.onSubmit(trimmed())
      props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to rename calendar"))
      saving.set(false)
    }
  }

  return (
    <Dialog
      open
      class="w-[425px]"
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename calendar</DialogTitle>
        <DialogDescription>Choose a new display name for this calendar.</DialogDescription>
      </DialogHeader>
      <View class="gap-2">
        <Input
          variant="default"
          autoFocus
          value={name()}
          readonly={saving()}
          invalid={!trimmed() || !!error()}
          placeholder="Calendar name"
          onChange={({ value }) => name.set(value)}
          onSubmit={() => void submit()}
        />
        <ErrorText message={trimmed() ? null : "Enter a calendar name."} />
        <ErrorText message={error()} />
      </View>
      <DialogFooter>
        <Button variant="ghost" label="Cancel" onPress={props.onClose} disabled={saving()} />
        <Button
          label={saving() ? "Saving..." : "Save"}
          onPress={() => void submit()}
          disabled={!trimmed() || saving()}
        />
      </DialogFooter>
    </Dialog>
  )
}
