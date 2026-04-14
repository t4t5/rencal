import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window"
import { HiOutlineCog6Tooth as SettingsIcon } from "react-icons/hi2"

import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { isMacOS } from "@/lib/utils"

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

  new WebviewWindow("settings", {
    url: "/?view=settings",
    title: "Settings",
    titleBarStyle: "overlay",
    width,
    height,
    decorations: isMacOS,
    x: Math.round((screenW - width) / 2),
    y: Math.round((screenH - height) / 2),
    parent: getCurrentWindow(),
  })
}

export const SettingsButton = () => {
  return (
    <ShortcutTooltip text="Settings" shortcut="mod+comma">
      <Button variant="ghost" onClick={() => openSettingsWindow()}>
        <SettingsIcon />
      </Button>
    </ShortcutTooltip>
  )
}
