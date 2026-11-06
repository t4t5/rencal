import { token } from "nsh"

import { InputGroup } from "@/components/ui/input-group"
import { TextareaInner } from "@/components/ui/textarea"

import { PushpinIcon } from "@/icons"

export function LocationInput(props: {
  value?: string | null
  onChange: (location: string) => void
  onClose?: () => void
  readOnly?: boolean
}) {
  return (
    <InputGroup readOnly={props.readOnly}>
      <PushpinIcon color={token("muted-foreground")} />
      <TextareaInner
        class="flex-1"
        placeholder="Location"
        value={props.value ?? ""}
        readonly={props.readOnly}
        submitBehavior="submit"
        onChange={({ value }) => props.onChange(value)}
        onSubmit={() => props.onClose?.()}
      />
    </InputGroup>
  )
}
