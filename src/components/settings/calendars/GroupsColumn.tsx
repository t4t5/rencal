import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { PlusIcon } from "@/icons/plus"

// TODO: Make this dynamic:
const GROUPS = ["Default", "Work"]
const ACTIVE_GROUP = "Default"

export function GroupsColumn() {
  return (
    <SettingsContent className="w-[220px] border-r border-r-divider gap-2 py-6">
      <div className="flex justify-between items-center w-full">
        <span className="text-sm text-muted-foreground">Groups</span>

        <Button size="icon-sm" variant="ghost">
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => (
          <div
            key={group}
            className={cn("text-sm rounded-md text-muted-foreground px-3 py-2", {
              "bg-secondary text-accent-foreground": ACTIVE_GROUP === group,
            })}
          >
            {group}
          </div>
        ))}
      </div>
    </SettingsContent>
  )
}
