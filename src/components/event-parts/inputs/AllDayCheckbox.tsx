import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { ControlContent, ControlLeading, ControlRow } from "@/components/ui/control-row"
import { Label } from "@/components/ui/label"

import { cn } from "@/lib/utils"

export const AllDayCheckbox = ({
  checked,
  onCheckedChange,
  readOnly,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  readOnly?: boolean
}) => {
  const id = useId()

  return (
    <ControlRow asChild>
      <Label
        htmlFor={id}
        className={cn(
          "h-control cursor-pointer gap-[var(--control-content-gap)] rounded-md border border-transparent font-normal",
          readOnly && "pointer-events-none",
        )}
      >
        <ControlLeading>
          <Checkbox
            id={id}
            checked={checked}
            disabled={readOnly}
            className="disabled:cursor-default disabled:opacity-100"
            onCheckedChange={() => {
              onCheckedChange(!checked)
            }}
            defaultChecked={false}
          />
        </ControlLeading>

        <ControlContent
          className={cn("text-muted-foreground", {
            "text-sidebar-primary-foreground": checked,
          })}
        >
          All-day
        </ControlContent>
      </Label>
    </ControlRow>
  )
}
