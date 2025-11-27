import { useRef, useState } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useOnClickOutside } from "@/hooks/useOnClickOutside"

export function AddEventButton() {
  const [isAdding, setIsAdding] = useState(false)
  const [text, setText] = useState("")

  const containerRef = useRef<HTMLDivElement>(null)

  useOnClickOutside(containerRef, () => {
    if (text === "") {
      setIsAdding(false)
    }
  })

  return (
    <div ref={containerRef}>
      {isAdding ? (
        <Input value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <Button variant="secondary" onClick={() => setIsAdding(true)}>
          <PlusIcon />
        </Button>
      )}
    </div>
  )
}
