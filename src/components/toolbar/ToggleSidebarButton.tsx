import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Button } from "@/components/ui/button"

import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"

import { SidebarIcon } from "@/icons/sidebar"

// Always shown, in the same place, so the sidebar can be hidden as well as brought back.
export function ToggleSidebarButton() {
  const { collapsed, toggleCollapsed } = useSidebarCollapse()
  const label = collapsed ? "Show sidebar" : "Hide sidebar"

  return (
    <CommandTooltip text={label} action="sidebar.toggle">
      <Button
        aria-label={label}
        aria-pressed={!collapsed}
        tabIndex={-1}
        size="icon"
        variant="ghost"
        onClick={toggleCollapsed}
      >
        <SidebarIcon />
      </Button>
    </CommandTooltip>
  )
}
