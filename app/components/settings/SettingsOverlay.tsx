import { View } from "nsh"
import { Button as BaseButton, Dialog } from "nsh/base"

import { Toaster } from "@/components/ui/toaster"
import { Tooltip } from "@/components/ui/tooltip"

import { CloseIcon } from "@/icons"
import { setSettingsOpen, settingsOpen, settingsTab } from "@/stores/view"

import { NAV_ITEMS, SettingsSidebar } from "./SettingsSidebar"
import { checkPluginUpdates } from "./plugins/plugin-updates"

function SettingsPanel() {
  const close = () => setSettingsOpen(false)
  checkPluginUpdates()

  return (
    <View class="min-h-0 flex-1 flex-row">
      <SettingsSidebar />
      <View class="min-h-0 min-w-0 flex-1">
        <Each of={NAV_ITEMS} key={(item) => item.tab}>
          {(item) => (
            <If when={settingsTab() === item().tab}>
              <View class="min-h-0 min-w-0 flex-1 flex-row">{item().page()}</View>
            </If>
          )}
        </Each>
      </View>
      <BaseButton
        accessibilityLabel="Close"
        onPress={close}
        tooltip={<Tooltip label="Close" placement="left" />}
        class="absolute right-2 top-[3px] p-1 opacity-70 hover:opacity-100"
      >
        <CloseIcon class="size-4" />
      </BaseButton>
      <Toaster />
    </View>
  )
}

/**
 * Settings: a window of its own in the old app, the whole window here. A dialog,
 * so that Escape closes what's on top of it first; toasts would show under it.
 */
export function SettingsOverlay() {
  return (
    <Dialog
      open={settingsOpen()}
      animation="none"
      onOpenChange={(event) => setSettingsOpen(event.open)}
      class="size-full bg-background text-foreground"
    >
      <SettingsPanel />
    </Dialog>
  )
}
