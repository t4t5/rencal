import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
            className={cn(
              "text-sm flex items-center justify-between gap-2 rounded-md text-muted-foreground px-3 py-2 group",
              {
                "bg-secondary text-accent-foreground": ACTIVE_GROUP === group,
              },
            )}
          >
            <span className="overflow-hidden text-ellipsis">{group}</span>
            <MoreMenu />
          </div>
        ))}
      </div>
    </SettingsContent>
  )
}

const MoreMenu = () => {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="invisible group-hover:visible">
          <MoreHorizIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => {}}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => {}}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
