// The window itself: its frame, and coming forward when a later launch asks.
import { cleanup, platform } from "nsh"
import { Window } from "nsh/desktop"
import { Backend } from "rencal/native"

import { listenFocusWindow } from "@/lib/api/notifications"

export function startWindow() {
  Backend.configureWindow()
  // GTK's "hidden" keeps a close button, which a tiling compositor's windows don't
  // have, and "default" draws no bar there and the system's on stacking ones.
  if (platform.os === "macos") Window.setTitleBar({ style: "hidden" })
  cleanup(listenFocusWindow(() => Window.orderFront()).unlisten)
}
