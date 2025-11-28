import { LuMapPin as LocationIcon } from "react-icons/lu"

import { Section, SectionIcon, SectionInput } from "@/components/event-info/Section"

export const LocationSection = ({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (location: string) => void
}) => {
  return (
    <Section>
      <SectionIcon>
        <LocationIcon className="size-4" />
      </SectionIcon>
      <SectionInput
        placeholder="Location"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </Section>
  )
}
