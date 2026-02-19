import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { cn } from "@/lib/utils"

export const AllDayCheckbox = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) => {
  const id = useId()

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="w-4 flex items-center">
        <Checkbox
          id={id}
          checked={checked}
          className="cursor-pointer"
          onCheckedChange={() => {
            onCheckedChange(!checked)
          }}
          defaultChecked={false}
        />
      </div>

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
