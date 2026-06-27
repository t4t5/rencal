import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { formatHotkeyKey } from "@/components/ui/shortcut-tooltip"

import { ArrowRightIcon } from "@/icons/arrow-right"

const ARROW_ROTATION: Record<string, string> = {
  right: "",
  left: "rotate-180",
  up: "-rotate-90",
  down: "rotate-90",
}

// Renders a binding's keys (e.g. "mod+shift+t") as a row of Kbd chips.
export function ShortcutKeys({ keys }: { keys: string }) {
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
