import { i18n, type MessageDescriptor } from "@lingui/core"
import { msg, t } from "@lingui/core/macro"
import * as React from "react"

import { isMacOS } from "@/lib/utils"

import { Kbd, KbdGroup } from "./kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const KEY_DISPLAY: Record<string, string | MessageDescriptor> = {
  comma: ",",
  period: ".",
  slash: "/",
  space: msg({ message: "Space", context: "keyboard key" }),
  enter: msg({ message: "Enter", context: "keyboard key" }),
  escape: msg({ message: "Esc", context: "keyboard key" }),
  backspace: msg({ message: "Backspace", context: "keyboard key" }),
  delete: msg({ message: "Delete", context: "keyboard key" }),
  tab: msg({ message: "Tab", context: "keyboard key" }),
  arrowup: msg({ message: "Up", context: "keyboard key" }),
  arrowdown: msg({ message: "Down", context: "keyboard key" }),
  arrowleft: msg({ message: "Left", context: "keyboard key" }),
  arrowright: msg({ message: "Right", context: "keyboard key" }),
}

export function formatHotkeyKey(key: string): string {
  if (key === "mod") return isMacOS ? "\u2318" : t({ message: "Ctrl", context: "keyboard key" })
  if (key === "shift") return isMacOS ? "\u21E7" : t({ message: "Shift", context: "keyboard key" })
  if (key === "alt") return isMacOS ? "\u2325" : t({ message: "Alt", context: "keyboard key" })
  if (key === "ctrl") return isMacOS ? "\u2303" : t({ message: "Ctrl", context: "keyboard key" })
  const label = KEY_DISPLAY[key]
  if (label === undefined) return key.toUpperCase()
  return typeof label === "string" ? label : i18n._(label)
}

export function ShortcutTooltip({
  text,
  shortcut,
  open,
  children,
}: {
  text: string
  shortcut: string
  children: React.ReactNode
  open?: boolean
}) {
  const keys = shortcut.split("+").map(formatHotkeyKey)

  return (
    <Tooltip open={open} delayDuration={1000}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="py-1 px-2">
        <span>{text}</span>

        <KbdGroup>
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}
