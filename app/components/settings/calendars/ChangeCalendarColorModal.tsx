import { signal, View } from "nsh"
import { Slider } from "nsh/base"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { type Calendar, getErrorMessage } from "@/lib/api"
import { hexToHue, hueToHex } from "@/lib/color-utils"

const HUE_GRADIENT =
  "linear-gradient(to right, #e05252, #e0e052, #52e052, #52e0e0, #5252e0, #e052e0, #e05252)"

export function ChangeCalendarColorModal(props: {
  calendar: Calendar
  onClose: () => void
  onSubmit: (color: string) => Promise<void>
}) {
  const initialHue = hexToHue(props.calendar.color)
  const hue = signal(initialHue)
  const color = signal(props.calendar.color ?? hueToHex(initialHue))
  const saving = signal(false)
  const error = signal<string | null>(null)

  const save = async () => {
    saving.set(true)
    error.set(null)
    try {
      await props.onSubmit(color())
      props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to change calendar color"))
      saving.set(false)
    }
  }

  return (
    <Dialog
      open
      class="w-[425px] gap-6"
      onOpenChange={(open) => {
        if (!open && !saving()) props.onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>Change calendar color</DialogTitle>
        <DialogDescription>
          Choose a color for {props.calendar.name || props.calendar.slug}.
        </DialogDescription>
      </DialogHeader>
      <View class="flex-row items-center gap-4">
        <View class="size-8 shrink-0 rounded-full" style={{ backgroundColor: color() }} />
        <Slider
          class="flex-1"
          min={0}
          max={359}
          value={hue()}
          accessibilityLabel="Calendar color hue"
          onChange={({ value }) => {
            const next = value as number
            hue.set(next)
            color.set(hueToHex(next))
          }}
          trackClass="h-5 justify-center"
          indicatorClass="h-3 rounded-full"
          indicatorStyle={{ backgroundImage: HUE_GRADIENT }}
          thumbClass="size-5 rounded-full border-2 border-background bg-foreground"
        />
      </View>
      <ErrorText message={error()} />
      <DialogFooter>
        <Button variant="secondary" label="Cancel" onPress={props.onClose} disabled={saving()} />
        <Button
          label={saving() ? "Saving..." : "Save color"}
          onPress={() => void save()}
          disabled={saving()}
        />
      </DialogFooter>
    </Dialog>
  )
}
