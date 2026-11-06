import { View } from "nsh"

import { Kbd, KbdGroup } from "@/components/ui/kbd"

import { isMacOS } from "@/lib/utils"

import { ArrowRightIcon } from "@/icons"

const KEY_DISPLAY: Partial<Record<string, string>> = {
  comma: ",",
  period: ".",
  slash: "/",
  space: "Space",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
}

export function formatHotkeyKey(key: string): string {
  if (key === "mod") return isMacOS ? "⌘" : "Ctrl"
  if (key === "shift") return isMacOS ? "⇧" : "Shift"
  if (key === "alt") return isMacOS ? "⌥" : "Alt"
  if (key === "ctrl") return isMacOS ? "⌃" : "Ctrl"
  if (key === "meta") return isMacOS ? "⌘" : "Super"
  return KEY_DISPLAY[key] ?? key.toUpperCase()
}

const ARROW_ROTATION: Partial<Record<string, number>> = { right: 0, down: 90, left: 180, up: 270 }

/** An arrow pointing `direction`, in a key cap. */
export function ArrowKey(props: { direction: string }) {
  return (
    <Kbd>
      <View style={{ transform: [{ rotate: `${ARROW_ROTATION[props.direction] ?? 0}deg` }] }}>
        <ArrowRightIcon class="size-3 text-muted-foreground" />
      </View>
    </Kbd>
  )
}

/** A binding's keys ("mod+shift+t") as a row of key caps. */
export function ShortcutKeys(props: { keys: string }) {
  return (
    <KbdGroup>
      <Each of={props.keys.split("+")}>
        {(part) => (
          <If
            when={ARROW_ROTATION[part()] !== undefined}
            else={<Kbd label={formatHotkeyKey(part())} />}
          >
            <ArrowKey direction={part()} />
          </If>
        )}
      </Each>
    </KbdGroup>
  )
}
