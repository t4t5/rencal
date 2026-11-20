import { Text } from "nsh"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { cn } from "@/lib/utils"

import {
  availableUpdate,
  closeUpdatePrompt,
  installUpdate,
  updateActionLabel,
  updateError,
  updatePhase,
  updatePromptOpen,
} from "@/stores/update"
import { typography } from "@/themes"

/** Asks at launch whether to install a newer version. */
export function UpdateDialog() {
  const busy = () => updatePhase() !== "idle"
  return (
    <Dialog
      open={updatePromptOpen()}
      onOpenChange={(open) => !open && !busy() && closeUpdatePrompt()}
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle>Update available</DialogTitle>
        <DialogDescription>
          renCal v{availableUpdate()?.version} is available. Download and install it now?
        </DialogDescription>
        <If when={updateError()}>
          <Text class={cn(typography.body(), "text-destructive")}>{updateError()}</Text>
        </If>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="secondary"
          label="Later"
          autoFocus
          disabled={busy()}
          onPress={closeUpdatePrompt}
        />
        <Button
          label={updateActionLabel("Download")}
          disabled={busy()}
          onPress={() => void installUpdate()}
        />
      </DialogFooter>
    </Dialog>
  )
}
