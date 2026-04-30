import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { InputGroupAddon } from "@/components/ui/input-group"
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
    <div
      className={cn(
        "flex items-center gap-2 px-3 pl-0 h-control-height",
        readOnly && "pointer-events-none",
      )}
    >
      <InputGroupAddon>
        <Checkbox
          id={id}
          checked={checked}
          className="cursor-pointer"
          onCheckedChange={() => {
            onCheckedChange(!checked)
          }}
          defaultChecked={false}
        />
      </InputGroupAddon>

      <Label
        htmlFor={id}
        className={cn("cursor-pointer text-muted-foreground", {
          "text-sidebar-primary-foreground": checked,
        })}
      >
        All-day
      </Label>
    </div>
  )
}
