import { LuMapPin as LocationIcon } from "react-icons/lu"

import { Section, SectionIcon, SectionInput } from "@/components/event-info/Section"

export const LocationSection = () => {
  return (
    <Section>
      <SectionIcon>
        <LocationIcon className="size-4" />
      </SectionIcon>
      <SectionInput placeholder="Location" />
    </Section>
  )
}
