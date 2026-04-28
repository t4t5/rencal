import { useEffect, useRef } from "react"

import { DragRegion } from "@/components/ui/drag-region"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn, isMacOS } from "@/lib/utils"

import { PlusIcon } from "@/icons/plus"

import { AddEventInput } from "./AddEventInput"

export function AddEventButton() {
  const { text, setText } = useEventText()
  const { isDrafting, setIsDrafting } = useEventDraft()
  const containerRef = useRef<HTMLDivElement>(null)

  const exitDraft = () => {
    setText("")
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
    <div
      className={cn(
        "absolute inset-0 flex justify-end transition duration-75 z-20 md:static md:w-full",
        {
          "pl-[70px]": isMacOS,
          "bg-transparent right-auto w-[105px] md:w-full": !isDrafting,
          "bg-background right-0": isDrafting,
        },
      )}
    >
      {isMd && <Spacer grow={!isDrafting} />}

      <ShortcutTooltip open={isDrafting ? false : undefined} text="Create new event" shortcut="c">
        <div
          ref={containerRef}
          className={cn(
            "relative transition-[flex-grow,flex-basis] duration-200 ease-out shrink-0",
            isDrafting ? "grow basis-0" : "grow-0 basis-[var(--control-height)]",
          )}
        >
          <AddEventInput onExit={exitDraft} />
          <PlusButtonOverlay show={!isDrafting} />
        </div>
      </ShortcutTooltip>

      {!isMd && <Spacer grow={!isDrafting} />}
    </div>
  )
}

const Spacer = ({ grow }: { grow?: boolean }) => {
  return (
    <DragRegion
      className={cn("transition-[flex-grow] duration-200 ease-out", grow ? "grow" : "grow-0")}
    />
  )
}

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
