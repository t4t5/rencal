import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window"

import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { rpc } from "@/rpc"

import { isMacOS } from "@/lib/utils"

import { SettingsIcon } from "@/icons/settings"
import { getActiveAppearance } from "@/themes/appearance"
import { THEME_IDS, type ThemeId } from "@/themes/manifest"

function activeThemeId(): ThemeId {
  const id = document.body.dataset.theme
  return (THEME_IDS as readonly string[]).includes(id ?? "") ? (id as ThemeId) : THEME_IDS[0]
}

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel("settings")
  if (existing) {
    await existing.setFocus()
    return
  }

  const width = 700
  const height = 500
  const monitor = await currentMonitor()
  const scale = monitor?.scaleFactor ?? 1
  const screenW = (monitor?.size.width ?? width) / scale
  const screenH = (monitor?.size.height ?? height) / scale
  const needsNative = await rpc.platform.needs_native_decorations()

  const appearance = getActiveAppearance(activeThemeId())

  new WebviewWindow("settings", {
    url: "/?appWindow=settings",
    title: "Settings",
    titleBarStyle: isMacOS ? "overlay" : undefined,
    width,
    height,
    resizable: false,
    decorations: isMacOS || needsNative,
    // Match OS chrome to the app theme: macOS titlebar text color,
    // Windows DWM immersive light/dark. GTK is handled globally in lib.rs.
    theme: appearance,
    x: Math.round((screenW - width) / 2),
    y: Math.round((screenH - height) / 2),
    parent: getCurrentWindow(),
  })
}

export const SettingsButton = () => {
  return (
    <ShortcutTooltip text="Settings" shortcut="mod+comma">
      <Button variant="ghost" onClick={() => openSettingsWindow()}>
        <SettingsIcon className="size-4" />
      </Button>
    </ShortcutTooltip>
  )
}
