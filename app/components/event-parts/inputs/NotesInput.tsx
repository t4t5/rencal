import { Textarea } from "@/components/ui/textarea"

export function NotesInput(props: {
  value?: string | null
  onChange: (notes: string) => void
  readOnly?: boolean
}) {
  return (
    <Textarea
      placeholder="Notes"
      value={props.value ?? ""}
      readonly={props.readOnly}
      onChange={({ value }) => props.onChange(value)}
    />
  )
}
