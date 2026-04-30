import { ReactNode, RefObject, useEffect, useRef } from "react"

import { DragRegion } from "@/components/ui/drag-region"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn, isMacOS } from "@/lib/utils"

import { PlusIcon } from "@/icons/plus"

import { useFlyAnimation } from "../FlyAnimation"
import { ComposeEventInput } from "./ComposeEventInput"

export function ComposeEventButton() {
  const { isDrafting, setIsDrafting } = useEventDraft()
  const { isFlying } = useFlyAnimation()

  const { text } = useEventText()

  const expanded = isDrafting || isFlying

  const containerRef = useRef<HTMLDivElement>(null)

  const exitDraft = () => {
    setIsDrafting(false)
    containerRef.current?.querySelector("input")?.blur()
  }

  useOnClickOutside(containerRef, () => {
    if (text === "" && isDrafting) {
      exitDraft()
    }
  })

  useEffect(() => {
    if (isDrafting) {
      containerRef.current?.querySelector("input")?.focus()
    }
  }, [isDrafting])

  const isMd = useBreakpoint("md")

  return (
    <SidebarOverlay expanded={expanded}>
      {isMd && <Spacer grow={!expanded} />}

      <ShortcutTooltip open={expanded ? false : undefined} text="Create new event" shortcut="c">
        <ButtonContainer expanded={expanded} ref={containerRef}>
          <ComposeEventInput onExit={exitDraft} />
          <PlusButtonOverlay show={!expanded} />
        </ButtonContainer>
      </ShortcutTooltip>

      {!isMd && <Spacer grow={!expanded} />}
    </SidebarOverlay>
  )
}

// This grows to overlap the other elements in the header.
// This way, the user can fully focus on composing their event
// without the other toolbar buttons being in the way
const SidebarOverlay = ({ expanded, children }: { expanded: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "absolute inset-0 flex justify-end transition duration-75 z-20 md:static md:w-full",
      {
        "pl-[70px]": isMacOS,
        "bg-transparent right-auto w-[105px] md:w-full": !expanded,
        "bg-background right-0": expanded,
      },
    )}
  >
    {children}
  </div>
)

const ButtonContainer = ({
  children,
  expanded,
  ref,
}: {
  children: ReactNode
  expanded: boolean
  ref: RefObject<HTMLDivElement | null>
}) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative transition-[flex-grow,flex-basis] duration-200 ease-out shrink-0",
        expanded ? "grow basis-0" : "grow-0 basis-[var(--control-height)]",
      )}
    >
      {children}
    </div>
  )
}

// Empty space filled by this, so that the window stays draggable
const Spacer = ({ grow }: { grow?: boolean }) => {
  return (
    <DragRegion
      className={cn("transition-[flex-grow] duration-200 ease-out", grow ? "grow" : "grow-0")}
    />
  )
}

// The compose "button" is just an ilusion.
// It's actually an input with this overlay so that it looks like a button:
// This makes it easier to animate the button -> input expansion
const PlusButtonOverlay = ({ show }: { show: boolean }) => {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 size-control-height flex items-center justify-center pointer-events-none transition-opacity duration-150",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <PlusIcon className="size-4" />
    </div>
  )
}
