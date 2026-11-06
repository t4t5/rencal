// The macOS menu bar: its items run the same commands as keys do.
import { openUrl, platform } from "nsh"
import { type MenuItem, Menu } from "nsh/desktop"

import { runSafely } from "@/stores/commands"

const WEBSITE_URL = "https://rencal.org"
const ISSUES_URL = "https://github.com/t4t5/rencal/issues/new"

const command = (label: string, action: string, shortcut: string): MenuItem => ({
  label,
  shortcut,
  onSelect: () => runSafely({ command: action }, "menu"),
})

/** Elsewhere the title bar is the app's, and keys do what the menu would. */
export function setAppMenu() {
  if (platform.os !== "macos") return
  Menu.setApplicationMenu([
    {
      label: "renCal",
      submenu: [
        { role: "about" },
        { type: "separator" },
        command("Settings…", "app.settings", "mod+,"),
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        command("New Event", "event.new", "mod+n"),
        command("Duplicate Event", "event.duplicate", "mod+d"),
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        // Views use Cmd+<digit> to avoid clobbering system Cmd+W (close) / Cmd+M (minimize).
        command("Week", "view.switch:week", "mod+1"),
        command("Month", "view.switch:month", "mod+2"),
        command("Year", "view.switch:year", "mod+3"),
        { type: "separator" },
        command("Go to Today", "date.today", "mod+t"),
        command("Go to Date…", "date.go", "mod+g"),
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
    {
      label: "Help",
      submenu: [
        command("Keyboard Shortcuts", "app.shortcuts", "mod+/"),
        { type: "separator" },
        { label: "renCal Website", onSelect: () => void openUrl(WEBSITE_URL) },
        { label: "Report an Issue", onSelect: () => void openUrl(ISSUES_URL) },
      ],
    },
  ])
}
