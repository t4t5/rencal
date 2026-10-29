import { useRef } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type ScheduledDayContextMenuProps = {
  children: React.ReactNode
  onCreateEvent: (anchorEl: HTMLElement, clickY: number) => void
  disabled?: boolean
}

export function ScheduledDayContextMenu({
  children,
  onCreateEvent,
  disabled,
}: ScheduledDayContextMenuProps) {
  const anchorRef = useRef<HTMLElement | null>(null)
  const clickYRef = useRef(0)

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger
        asChild
        disabled={disabled}
        onContextMenu={(e: React.MouseEvent) => {
          anchorRef.current = e.currentTarget as HTMLElement
          clickYRef.current = e.clientY
        }}
        onDoubleClick={(e: React.MouseEvent) => {
          if (disabled) return
          if ((e.target as HTMLElement).closest("[data-event-clickable]")) return
          onCreateEvent(e.currentTarget as HTMLElement, e.clientY)
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setTimeout(() => onCreateEvent(anchorRef.current!, clickYRef.current))
          }}
        >
          Create event
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
