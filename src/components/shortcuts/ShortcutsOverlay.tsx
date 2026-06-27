import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { ShortcutDef, ShortcutGroup, SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts"

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {SHORTCUT_GROUPS.map((group) => (
            <ShortcutGroupSection key={group} group={group} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutGroupSection({ group }: { group: ShortcutGroup }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-muted-foreground pb-1 text-xs font-medium tracking-wide uppercase">
        {group}
      </h3>

      {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
        <ShortcutRow key={shortcut.id} shortcut={shortcut} />
      ))}
    </div>
  )
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDef }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-sm">
      <span>{shortcut.label}</span>

      <div className="flex items-center gap-1.5">
        {shortcut.bindings
          .filter((binding) => !binding.hidden)
          .map((binding, i) => (
            <span key={binding.keys} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground text-xs">or</span>}
              <ShortcutKeys keys={binding.keys} />
            </span>
          ))}
      </div>
    </div>
  )
}
