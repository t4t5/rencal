import { useEffect, useRef } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn } from "@/lib/utils"

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

  return (
    <>
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

      <div
        className={cn(
          "h-full transition-[flex-grow] duration-200 ease-out",
          isDrafting ? "grow-0" : "grow",
        )}
        data-tauri-drag-region
      />
    </>
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
