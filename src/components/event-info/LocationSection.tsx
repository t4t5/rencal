import { LuMapPin as LocationIcon } from "react-icons/lu"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

export const LocationSection = ({
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
      <InputGroupInput
        placeholder="Location"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  )
}
