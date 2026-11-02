import type { ReactNode } from "react"

import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useActionKeys } from "@/contexts/KeyBindingsContext"

// A tooltip showing the keys currently bound to `action`, if any.
export function CommandTooltip({
  action,
  text,
  open,
  children,
}: {
  action: string
  text: string
  open?: boolean
  children: ReactNode
}) {
  const keys = useActionKeys(action)
  return (
    <ShortcutTooltip text={text} shortcut={keys} open={open}>
      {children}
    </ShortcutTooltip>
  )
}
