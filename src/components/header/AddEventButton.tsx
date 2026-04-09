import { useEffect, useRef } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { Input } from "@/components/ui/input"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn } from "@/lib/utils"

export function AddEventButton() {
  const { text, setText, isDrafting, setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const containerRef = useRef<HTMLDivElement>(null)

  const exitDraft = () => {
    setText("")
    setIsDrafting(false)
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
      <div
        ref={containerRef}
        className={cn(
          "relative transition-[flex-grow,flex-basis] duration-200 ease-out",
          isDrafting ? "grow basis-0" : "grow-0 basis-[var(--buttonHeight)]",
        )}
      >
        <Input
          ghost={false}
          value={isDrafting ? text : ""}
          placeholder={isDrafting ? "Meeting at 3pm" : ""}
          readOnly={!isDrafting}
          tabIndex={isDrafting ? 0 : -1}
          onChange={(e) => setText(e.target.value)}
          onClick={() => {
            if (!isDrafting) {
              setDefaultDraftEvent()
              setIsDrafting(true)
            }
          }}
          onKeyDown={(e) => {
            if (!isDrafting) return
            if (e.key === "Escape") {
              if (text) {
                setText("")
              } else {
                exitDraft()
              }
            }
          }}
          className={cn("w-full", !isDrafting && "cursor-pointer caret-transparent")}
        />
        <div
          className={cn(
            "absolute left-0 top-0 size-buttonHeight flex items-center justify-center pointer-events-none transition-opacity duration-150",
            isDrafting ? "opacity-0" : "opacity-100",
          )}
        >
          <PlusIcon className="size-4" />
        </div>
      </div>

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
