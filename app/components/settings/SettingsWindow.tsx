import { platform, View } from "nsh"
import { Button as BaseButton } from "nsh/base"
import { currentWindow, Window } from "nsh/desktop"

import { Toaster } from "@/components/ui/toaster"
import { Tooltip } from "@/components/ui/tooltip"

import { CloseIcon } from "@/icons"
import { SETTINGS_WINDOW, setSettingsOpen, settingsOpen, settingsTab } from "@/stores/view"

import { settingsFrameless } from "./SettingsContent"
import { NAV_ITEMS, SettingsSidebar } from "./SettingsSidebar"
import { checkPluginUpdates } from "./plugins/plugin-updates"

const isMacOS = platform.os === "macos"

function SettingsPanel() {
  const win = currentWindow()
  checkPluginUpdates()

  return (
    <View class="flex-1 flex-row bg-background text-foreground">
      {/* macOS draws its traffic lights over the sidebar, which keeps the title bar's height
          clear (and draggable); the pages run to the top, with only the sidebar's edge between. */}
      <SettingsSidebar topInset={win.titleBar().height} />
      <View class="min-h-0 min-w-0 flex-1">
        <Each of={NAV_ITEMS} key={(item) => item.tab}>
          {(item) => (
            <If when={settingsTab() === item().tab}>
              <View class="min-h-0 min-w-0 flex-1 flex-row">{item().page()}</View>
            </If>
          )}
        </Each>
      </View>
      <If when={settingsFrameless}>
        <BaseButton
          accessibilityLabel="Close"
          onPress={() => win.close()}
          tooltip={<Tooltip label="Close" placement="left" />}
          class="absolute right-2 top-[3px] p-1 opacity-70 hover:opacity-100"
        >
          <CloseIcon class="size-4" />
        </BaseButton>
      </If>
      <Toaster />
    </View>
  )
}

/**
 * Settings, in a window of its own over the main one, as in the old app. A dialog:
 * Escape closes it once nothing in it takes the key.
 */
export function SettingsWindow() {
  return (
    <Window
      id={SETTINGS_WINDOW}
      kind="dialog"
      title="Settings"
      defaultSize={{ width: 800, height: 500 }}
      resizable={false}
      titleBar={isMacOS ? { style: "hidden" } : undefined}
      frame={settingsFrameless ? "none" : undefined}
      open={settingsOpen()}
      onOpenChange={(event) => setSettingsOpen(event.open)}
    >
      <SettingsPanel />
    </Window>
  )
}
