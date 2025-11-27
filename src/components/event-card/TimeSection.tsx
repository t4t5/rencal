import { GoClock as ClockIcon } from "react-icons/go"
import { IoIosArrowRoundForward as ArrowIcon } from "react-icons/io"

import { Section, SectionIcon, SectionInput } from "@/components/event-card/Section"

export const TimeSection = () => {
  return (
    <Section>
      <SectionIcon>
        <ClockIcon className="size-4" />
      </SectionIcon>

      <div className="flex">
        <SectionInput placeholder="09:30" className="w-[85px]" />
        <ArrowIcon className="size-5 shrink-0" />
        <SectionInput placeholder="10:30" className="pl-4" />
      </div>
    </Section>
  )
}
