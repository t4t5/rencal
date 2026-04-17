import { useEffect, useRef } from "react"

import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn } from "@/lib/utils"

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
    <div className="flex grow">
      {isMd && <Spacer grow={!isDrafting} />}

      <ShortcutTooltip open={isDrafting ? false : undefined} text="Create new event" shortcut="c">
        <div
          ref={containerRef}
          className={cn(
            "relative transition-[flex-grow,flex-basis] duration-200 ease-out shrink-0",
            isDrafting ? "grow basis-0" : "grow-0 basis-[var(--buttonHeight)]",
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
    <div
      className={cn(
        "h-full transition-[flex-grow] duration-200 ease-out",
        grow ? "grow" : "grow-0",
      )}
      data-tauri-drag-region
    />
  )
}

const PlusButtonOverlay = ({ show }: { show: boolean }) => {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 size-buttonHeight flex items-center justify-center pointer-events-none transition-opacity duration-150",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <PlusIcon className="size-4" />
    </div>
  )
}
