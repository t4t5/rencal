import { LuMapPin as LocationIcon } from "react-icons/lu"

import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"

export const LocationInput = ({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (location: string) => void
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
      />
    </InputGroup>
  )
}
