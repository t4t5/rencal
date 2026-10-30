import { type HTMLAttributes, type ReactElement, type ReactNode, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import {
  ContextMenu as ContextMenuRoot,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tooltip as TooltipRoot, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useEventDragRole } from "@/contexts/EventDragContext"

import { isDraft, setMenuEvent } from "./event-state"
import { type CalendarEvent, toAppEvent } from "./events"

/**
 * renCal's right-click menu for an event (edit, duplicate, delete) on its only
 * child, which must accept a ref and props. While it's open the event is
 * selected (`useEventState`). Drafts and drag previews get no menu.
 */
export function EventMenu({ event, children }: { event: CalendarEvent; children: ReactElement }) {
  const appEvent = toAppEvent(event)
  const dragRole = useEventDragRole(appEvent)
  if (isDraft(appEvent) || dragRole === "preview") return children

  return (
    <EventContextMenu event={appEvent} onOpenChange={(open) => setMenuEvent(event.key, open)}>
      {children}
    </EventContextMenu>
  )
}

export interface MenuItem {
  readonly label: string
  /** Runs after the menu has closed, so it can open a popover. */
  readonly onSelect: () => void
}

// Props the SDK's wrappers pass on to their child, so they can nest inside
// one another (`EventMenu` around a `Tooltip`) like Radix triggers do.
type ForwardedProps = Omit<HTMLAttributes<HTMLElement>, "content">

/** A right-click menu on its only child, which must accept a ref and props. */
export function ContextMenu({
  items,
  children,
  ...props
}: ForwardedProps & {
  items: readonly MenuItem[]
  children: ReactElement
}) {
  return (
    <ContextMenuRoot modal={false}>
      <ContextMenuTrigger asChild {...props}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item) => (
          <ContextMenuItem key={item.label} onClick={() => setTimeout(item.onSelect)}>
            {item.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenuRoot>
  )
}

// Portaled content still bubbles React events to the trigger's ancestors, like
// a day cell's click or drag-to-create.
const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation()

/**
 * A tooltip on its only child, which must accept a ref and props. `disabled`
 * hides it, e.g. while the event is dragged or its menu is open. Pass `open`
 * and `onOpenChange` to control it, e.g. to close it from a click inside.
 * Clicks inside never reach the elements around the child.
 */
export function Tooltip({
  content,
  side = "top",
  delay = 500,
  disabled = false,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: ForwardedProps & {
  content: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  /** Milliseconds the pointer rests on the child before the tooltip shows. */
  delay?: number
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  children: ReactElement
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState

  return (
    <TooltipRoot
      delayDuration={delay}
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpenState(next)
        onOpenChange?.(next)
      }}
    >
      <TooltipTrigger asChild {...props}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={className}
        onPointerDown={stopPropagation}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
        onContextMenu={stopPropagation}
      >
        {content}
      </TooltipContent>
    </TooltipRoot>
  )
}
