import type { Stop } from "@/components/event-parts/popup-stops"
import { Textarea } from "@/components/ui/textarea"

export function NotesInput(props: {
  value?: string | null
  onChange: (notes: string) => void
  readOnly?: boolean
  inputRef?: (ref: Stop) => void
  onFocus?: () => void
  onBlur?: () => void
}) {
  return (
    <Textarea
      ref={(input) => props.inputRef?.(input)}
      onFocus={() => props.onFocus?.()}
      onBlur={() => props.onBlur?.()}
      testID="event-notes"
      placeholder="Notes"
      value={props.value ?? ""}
      readonly={props.readOnly}
      onChange={({ value }) => props.onChange(value)}
    />
  )
}
