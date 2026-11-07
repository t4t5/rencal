// The main window itself: its frame, and coming forward when a later launch asks.
import { cleanup, platform } from "nsh"
import { currentWindow } from "nsh/desktop"
import { Backend } from "rencal/native"

import { listenFocusWindow } from "@/lib/api/notifications"

/** Called while the root renders, where `currentWindow()` is the main window. */
export function startWindow() {
  const win = currentWindow()
  Backend.configureWindow()
  // GTK's "hidden" keeps a close button, which a tiling compositor's windows don't
  // have, and "default" draws no bar there and the system's on stacking ones.
  win.set({ title: "renCal" })
  if (platform.os === "macos") win.set({ titleBar: { style: "hidden" } })
  cleanup(listenFocusWindow(() => win.focus()).unlisten)
}
