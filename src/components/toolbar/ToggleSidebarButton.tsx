import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Button } from "@/components/ui/button"

import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"

import { SidebarIcon } from "@/icons/sidebar"

export function ToggleSidebarButton() {
  const { collapsed, setCollapsed } = useSidebarCollapse()

  if (!collapsed) return null

  return (
    <CommandTooltip text="Show sidebar" action="sidebar.toggle">
      <Button
        aria-label="Show sidebar"
        tabIndex={-1}
        size="icon"
        variant="ghost"
        onClick={() => setCollapsed(false)}
      >
        <SidebarIcon />
      </Button>
    </CommandTooltip>
  )
}
