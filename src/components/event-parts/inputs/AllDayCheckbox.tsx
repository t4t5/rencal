import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { ItemContent, ItemMedia } from "@/components/ui/item"
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
    <Label
      htmlFor={id}
      className={cn(
        "control-row h-control w-fit gap-[var(--control-content-gap)] rounded-md border border-transparent font-normal",
        readOnly && "pointer-events-none",
      )}
    >
      <ItemMedia>
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
      </ItemMedia>

      <ItemContent
        className={cn("text-muted-foreground", {
          "text-sidebar-primary-foreground": checked,
        })}
      >
        All-day
      </ItemContent>
    </Label>
  )
}
