import { LuMapPin as LocationIcon } from "react-icons/lu"

import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

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
        <LocationIcon />
      </InputGroupAddon>
      <InputGroupTextarea
        placeholder="Location"
        value={value ?? ""}
        readOnly={readOnly}
        className={cn(readOnly && "hover:border-transparent! focus:bg-transparent!")}
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
