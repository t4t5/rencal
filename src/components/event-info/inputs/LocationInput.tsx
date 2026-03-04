import { LuMapPin as LocationIcon } from "react-icons/lu"

import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

export const LocationInput = ({
  value,
  onChange,
  onClose,
}: {
  value?: string | null
  onChange: (location: string) => void
  onClose?: () => void
}) => {
  return (
    <InputGroup>
      <InputGroupAddon>
        <LocationIcon />
      </InputGroupAddon>
      <InputGroupTextarea
        placeholder="Location"
        value={value ?? ""}
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
