import { Input } from "@/components/ui/input"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

export const AddEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText, isDrafting, setIsDrafting, setDefaultDraftEvent } = useEventDraft()

  return (
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
            onExit()
          }
        }
      }}
      className={cn("w-full", !isDrafting && "cursor-pointer caret-transparent")}
    />
  )
}
