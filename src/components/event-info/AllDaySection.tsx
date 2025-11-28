import { useId } from "react"

import { Section, SectionIcon } from "@/components/event-info/Section"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { cn } from "@/lib/utils"

export const AllDaySection = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) => {
  const id = useId()

  return (
    <Section>
      <SectionIcon className="pt-0">
        <Checkbox
          id={id}
          checked={checked}
          className="cursor-pointer"
          onCheckedChange={() => {
            onCheckedChange(!checked)
          }}
          defaultChecked={false}
        />
      </SectionIcon>

      <Label
        htmlFor={id}
        className={cn("cursor-pointer", {
          "text-sidebar-primary-foreground": checked,
        })}
      >
        All-day
      </Label>
    </Section>
  )
}
