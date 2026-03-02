import { useRef, useState } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { cn } from "@/lib/utils"

export function AddEventButton() {
  const { text, setText, isDrafting, setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const [isExiting, setIsExiting] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const exitDraft = () => {
    setText("")
    setIsExiting(true)
  }

  useOnClickOutside(containerRef, () => {
    if (text === "" && isDrafting) {
      exitDraft()
    }
  })

  const onNew = () => {
    setDefaultDraftEvent()
    setIsDrafting(true)
  }

  const showInput = isDrafting || isExiting

  return (
    <div ref={containerRef}>
      {showInput ? (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={isDrafting && !isExiting}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (text) {
                setText("")
              } else {
                exitDraft()
              }
            }
          }}
          className={cn(
            "border-none text-sm bg-secondary transition-[width] duration-200 ease-out",
            isExiting ? "w-10" : "w-full starting:w-10",
          )}
          onTransitionEnd={() => {
            if (isExiting) {
              setIsExiting(false)
              setIsDrafting(false)
            }
          }}
        />
      ) : (
        <Button variant="secondary" onClick={onNew}>
          <PlusIcon />
        </Button>
      )}
    </div>
  )
}
