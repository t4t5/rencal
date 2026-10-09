import { t } from "@lingui/core/macro"

import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"

import { SidebarIcon } from "@/icons/sidebar"

export function ToggleSidebarButton() {
  const { collapsed, setCollapsed } = useSidebarCollapse()

  if (!collapsed) return null

  return (
    <ShortcutTooltip text={t`Show sidebar`} shortcut="ctrl+b">
      <Button
        aria-label={t`Show sidebar`}
        tabIndex={-1}
        size="icon"
        variant="ghost"
        onClick={() => setCollapsed(false)}
      >
        <SidebarIcon />
      </Button>
    </ShortcutTooltip>
  )
}
