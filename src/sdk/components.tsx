import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
  useState,
} from "react"

import { Tooltip as TooltipRoot, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Portaled content still bubbles React events to the trigger's ancestors, like
// a day cell's click or drag-to-create.
const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation()

// The tooltip closes once an event in it is clicked, so its popover opens beside the trigger.
const TooltipTriggerContext = createContext<RefObject<Element | null> | null>(null)

/** The trigger of the tooltip this renders in, if any. */
export function useTooltipTrigger() {
  return useContext(TooltipTriggerContext)
}

/**
 * A tooltip on its only child, which must accept a ref and props. `disabled`
 * hides it, e.g. while the event is dragged or its menu is open. Pass `open`
 * and `onOpenChange` to control it, e.g. to close it from a click inside.
 * Clicks inside never reach the elements around the child, and events clicked
 * inside open their popover beside the child.
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
}: {
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
  // Typed as the trigger Radix renders; asChild puts it on the child.
  const triggerRef = useRef<HTMLButtonElement>(null)
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
      <TooltipTrigger ref={triggerRef} asChild>
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
        <TooltipTriggerContext value={triggerRef}>{content}</TooltipTriggerContext>
      </TooltipContent>
    </TooltipRoot>
  )
}
