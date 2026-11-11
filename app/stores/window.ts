// The main window itself: its frame, and coming forward when a later launch asks.
import { appInfo, cleanup, platform } from "nsh"
import { Application, currentWindow } from "nsh/desktop"
import { Backend } from "rencal/native"

import { listenFocusWindow } from "@/lib/api/notifications"

/** Called while the root renders, where `currentWindow()` is the main window. */
export function startWindow() {
  const win = currentWindow()
  // Where there's no visible close button, closing hides the window and the app
  // stays for its reminders. Development runs quit, or they'd linger unseen.
  if (!appInfo().development && !Backend.needsNativeDecorations()) {
    win.set({ closeOnPress: false })
    cleanup(win.on("closePress", () => win.hide()))
  }
  // GTK's "hidden" keeps a close button, which a tiling compositor's windows don't
  // have, and "default" draws no bar there and the system's on stacking ones.
  if (platform.os === "macos") win.set({ titleBar: { style: "hidden" } })
  cleanup(listenFocusWindow(() => win.focus()).unlisten)
  // NSH brings the window forward itself; the launch's links and files are ours.
  cleanup(
    Application.on("secondInstance", ({ args, cwd }) => void Backend.openLaunchArgs(args, cwd)),
  )
}
