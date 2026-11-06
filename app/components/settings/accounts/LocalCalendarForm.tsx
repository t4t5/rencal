import { signal, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { api, getErrorMessage } from "@/lib/api"
import { logger } from "@/lib/logger"
import { cn } from "@/lib/utils"

import { reloadCalendars } from "@/stores/calendar"

const COLOR_PALETTE = [
  "#7986cb",
  "#33b679",
  "#8e24aa",
  "#e67c73",
  "#f6bf26",
  "#f4511e",
  "#039be5",
  "#0b8043",
]

export function LocalCalendarForm(props: { onClose: () => void }) {
  const name = signal("")
  const color = signal(COLOR_PALETTE[0]!)
  const error = signal<string | null>(null)
  const creating = signal(false)

  async function submit() {
    error.set(null)
    const trimmed = name().trim()
    if (!trimmed) {
      error.set("Please enter a calendar name")
      return
    }
    creating.set(true)
    try {
      await api.calendars.create(trimmed, color())
      await reloadCalendars()
      props.onClose()
    } catch (e) {
      logger.error("Failed to create local calendar:", e)
      error.set(getErrorMessage(e, "Failed to create calendar"))
      creating.set(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New local-only calendar</DialogTitle>
        <DialogDescription>
          This calendar will live on your computer only, and never be connected to the internet.
        </DialogDescription>
      </DialogHeader>
      <View class="w-full gap-4">
        <Input
          variant="default"
          placeholder="Calendar name"
          autoFocus
          value={name()}
          onChange={({ value }) => name.set(value)}
          onSubmit={() => void submit()}
        />
        <View class="flex-row flex-wrap justify-center gap-2">
          <Each of={COLOR_PALETTE}>
            {(swatch) => (
              <BaseButton
                accessibilityLabel={`Color ${swatch()}`}
                onPress={() => color.set(swatch())}
                class={cn(
                  "size-7 rounded-full",
                  swatch() === color() && "border-2 border-foreground",
                )}
                style={{ backgroundColor: swatch() }}
              />
            )}
          </Each>
        </View>
        <ErrorText message={error()} />
        <View class="flex-row justify-end">
          <Button
            disabled={creating() || !name().trim()}
            label={creating() ? "Creating..." : "Create calendar"}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </>
  )
}
