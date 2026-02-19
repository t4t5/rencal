import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

export const NotesInput = ({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (notes: string) => void
}) => {
  return (
    <InputGroup>
      <InputGroupAddon>
        <div className="w-4" />
      </InputGroupAddon>
      <InputGroupTextarea
        placeholder="Notes"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  )
}
