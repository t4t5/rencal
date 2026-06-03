import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { formatHotkeyKey } from "@/components/ui/shortcut-tooltip"

import { ShortcutDef, ShortcutGroup, SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts"

import { ArrowRightIcon } from "@/icons/arrow-right"

// Directional arrow keys render as a rotated arrow icon rather than a glyph.
const ARROW_ROTATION: Record<string, string> = {
  right: "",
  left: "rotate-180",
  up: "-rotate-90",
  down: "rotate-90",
}

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

/** A titled section listing every shortcut belonging to one group. */
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

/** A single shortcut: its label on the left, its key bindings on the right. */
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
              <BindingChips keys={binding.keys} />
            </span>
          ))}
      </div>
    </div>
  )
}

/** Renders one binding (e.g. "mod+f") as a tight group of key chips. */
function BindingChips({ keys }: { keys: string }) {
  return (
    <KbdGroup>
      {keys.split("+").map((part, i) => {
        const rotation = ARROW_ROTATION[part]

        return (
          <Kbd key={`${part}-${i}`}>
            {rotation === undefined ? (
              formatHotkeyKey(part)
            ) : (
              <ArrowRightIcon className={rotation} />
            )}
          </Kbd>
        )
      })}
    </KbdGroup>
  )
}
