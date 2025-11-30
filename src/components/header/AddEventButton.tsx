import { useRef } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { useOnClickOutside } from "@/hooks/useOnClickOutside"

export function AddEventButton() {
  const { text, setText, isDrafting, setIsDrafting, setDefaultDraftEvent } = useEventDraft()

  const containerRef = useRef<HTMLDivElement>(null)

  useOnClickOutside(containerRef, () => {
    if (text === "") {
      setIsDrafting(false)
    }
  })

  const onNew = () => {
    setDefaultDraftEvent()
    setIsDrafting(true)
  }

  return (
    <div ref={containerRef} className="grow">
      {isDrafting ? (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="border-none text-sm bg-secondary"
        />
      ) : (
        <Button variant="secondary" onClick={onNew}>
          <PlusIcon />
        </Button>
      )}
    </div>
  )
}
