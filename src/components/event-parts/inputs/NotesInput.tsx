import { Textarea } from "@/components/ui/textarea"

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
    <Textarea
      placeholder="Notes"
      value={value ?? ""}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
