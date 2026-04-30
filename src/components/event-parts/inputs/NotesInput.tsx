import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

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
      <InputGroupAddon />
      <InputGroupTextarea
        placeholder="Notes"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  )
}
