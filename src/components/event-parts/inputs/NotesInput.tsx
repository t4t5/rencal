import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

export const NotesInput = ({
  value,
  onChange,
  readOnly,
}: {
  value?: string | null
  onChange: (notes: string) => void
  readOnly?: boolean
}) => {
  return (
    <InputGroup
      className={cn(
        "flex gap-2",
        readOnly && "hover:border-transparent! focus-within:bg-transparent!",
      )}
    >
      <InputGroupTextarea
        placeholder="Notes"
        value={value ?? ""}
        readOnly={readOnly}
        className="px-2"
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  )
}
