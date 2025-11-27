import { useState } from "react"

import { Section, SectionIcon } from "@/components/event-card/Section"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { cn } from "@/lib/utils"

export const AllDaySection = () => {
  const [checked, setChecked] = useState(false)

  return (
    <Section>
      <SectionIcon className="pt-0">
        <Checkbox
          id="all-day"
          checked={checked}
          className="cursor-pointer"
          onCheckedChange={() => {
            setChecked(!checked)
          }}
          defaultChecked={false}
        />
      </SectionIcon>

      <Label
        htmlFor="all-day"
        className={cn("cursor-pointer", {
          "text-sidebar-primary-foreground": checked,
        })}
      >
        All-day
      </Label>
    </Section>
  )
}
