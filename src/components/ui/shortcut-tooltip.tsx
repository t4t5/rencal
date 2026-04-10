import * as React from "react"

import { isMacOS } from "@/lib/utils"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const KEY_DISPLAY: Record<string, string> = {
  comma: ",",
  period: ".",
  slash: "/",
  space: "Space",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
}

function formatHotkeyKey(key: string): string {
  if (key === "mod") return isMacOS ? "\u2318" : "Ctrl"
  if (key === "shift") return isMacOS ? "\u21E7" : "Shift"
  if (key === "alt") return isMacOS ? "\u2325" : "Alt"
  if (key === "ctrl") return isMacOS ? "\u2303" : "Ctrl"
  return KEY_DISPLAY[key] ?? key.toUpperCase()
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

        <div className="flex gap-1">
          {keys.map((key) => (
            <span
              key={key}
              className="shadow-buttonBorder text-muted-foreground bg-popover px-1.5 py-0.5 rounded"
            >
              {key}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
