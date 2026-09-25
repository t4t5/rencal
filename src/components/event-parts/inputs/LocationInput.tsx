import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

import { PushpinIcon } from "@/icons/pushpin"

export const LocationInput = ({
  value,
  onChange,
  onClose,
  readOnly,
}: {
  value?: string | null
  onChange: (location: string) => void
  onClose?: () => void
  readOnly?: boolean
}) => {
  return (
    <InputGroup
      data-control="textarea"
      data-readonly={readOnly}
      className={cn(readOnly && "pointer-events-none")}
    >
      <InputGroupAddon>
        <PushpinIcon />
      </InputGroupAddon>
      <InputGroupTextarea
        placeholder="Location"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onClose?.()
          }
        }}
      />
    </InputGroup>
  )
}
