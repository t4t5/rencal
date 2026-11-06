import { signal, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { connectWithCredentials, isConnecting } from "@/components/settings/accounts/providers"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { getErrorMessage } from "@/lib/api"

const WEBCAL_PROVIDER = "webcal"

export function isSupportedCalendarUrl(value: string) {
  try {
    return ["webcal:", "http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function AddSubscriptionModal(props: { onClose: () => void }) {
  const url = signal("")
  const error = signal<string | null>(null)

  async function submit() {
    error.set(null)
    const trimmed = url().trim()
    if (!trimmed) {
      error.set("Please enter a calendar URL")
      return
    }
    if (!isSupportedCalendarUrl(trimmed)) {
      error.set("Please enter a webcal, http, or https URL")
      return
    }
    try {
      await connectWithCredentials(WEBCAL_PROVIDER, [{ id: "url", value: trimmed }])
      props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to add subscription"))
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
        <DialogTitle>Add subscription</DialogTitle>
        <DialogDescription>
          Paste a public .ics calendar feed URL (webcal or http)
        </DialogDescription>
      </DialogHeader>
      <View class="w-full gap-3">
        <Input
          variant="default"
          autoFocus
          placeholder="https://example.com/calendar.ics"
          value={url()}
          readonly={isConnecting()}
          onChange={({ value }) => url.set(value)}
          onSubmit={() => void submit()}
        />
        <ErrorText message={error()} />
        <View class="mt-3 flex-row justify-end">
          <Button
            disabled={isConnecting() || !url().trim()}
            label={isConnecting() ? "Adding..." : "Add subscription"}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </Dialog>
  )
}
