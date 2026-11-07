import { View } from "nsh"
import { titleBar } from "nsh/desktop"

import { SearchButton } from "@/components/search/SearchButton"
import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { InvitesBadge } from "@/components/toolbar/InvitesBadge"
import { SyncStatus } from "@/components/toolbar/SyncStatus"
import { Button } from "@/components/ui/button"

import { SettingsIcon } from "@/icons"
import { isWideWindow, openSettings } from "@/stores/view"

import { ComposeEventButton } from "./ComposeEventButton"

/** The "+", and in a narrow window what the main header would have held. */
export function SidebarToolbar() {
  return (
    <View
      class="flex-row items-center justify-end gap-3"
      style={{ paddingLeft: isWideWindow() ? 0 : titleBar().left }}
    >
      <ComposeEventButton />
      <If when={!isWideWindow()}>
        <View class="flex-1" desktop={{ windowDrag: true }} />
        <View class="flex-row items-center gap-2">
          <SyncStatus />
          <InvitesBadge />
          <View tooltip={<CommandTooltip text="Settings" action="app.settings" />}>
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Settings"
              onPress={() => openSettings()}
            >
              <SettingsIcon />
            </Button>
          </View>
          <SearchButton />
        </View>
      </If>
    </View>
  )
}
