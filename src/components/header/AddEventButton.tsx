import { useRef } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { Button } from "@/components/ui/button"
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

  const onNew = () => {
    setDefaultDraftEvent()
    setIsDrafting(true)
  }

  return (
    <>
      <div ref={containerRef} className={cn({ grow: isDrafting })}>
        {isDrafting ? (
          <Input
            ghost={false}
            value={text}
            placeholder="Meeting at 3pm"
            onChange={(e) => setText(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (text) {
                  setText("")
                } else {
                  exitDraft()
                }
              }
            }}
          />
        ) : (
          <Button variant="secondary" onClick={onNew} size="icon">
            <PlusIcon />
          </Button>
        )}
      </div>

      <div className={cn("h-full", { grow: !isDrafting })} data-tauri-drag-region />
    </>
  )
}
