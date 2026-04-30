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
      className={cn(readOnly && "hover:border-transparent! focus-within:bg-transparent!")}
    >
      <InputGroupAddon>
        <PushpinIcon />
      </InputGroupAddon>
      <InputGroupTextarea
        placeholder="Location"
        value={value ?? ""}
        readOnly={readOnly}
        className={"hover:border-transparent! focus:bg-transparent! pl-2"}
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
