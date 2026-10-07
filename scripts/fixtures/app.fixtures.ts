import { it } from "vitest"

import { COMMAND_GROUPS, PALETTE_COMMANDS } from "@/lib/palette-commands"
import { SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts"

import { writeFixture } from "./shared"

const CRATE = "rencal-app"

it("shortcuts", () => {
  writeFixture(CRATE, "shortcuts", {
    source: "src/lib/shortcuts.ts",
    description:
      "The keyboard shortcut table in display order. `type: char` bindings are single printable keys (react-hotkeys-hook `useKey`-style), `hotkey` bindings are modifier/named-key combos where `mod` = Cmd on macOS, Ctrl elsewhere. Optional flags default to false.",
    cases: [
      { name: "groups", input: null, output: SHORTCUT_GROUPS },
      ...SHORTCUTS.map((shortcut) => ({
        name: shortcut.id,
        input: null,
        output: {
          ...shortcut,
          allowWhileEventOpen:
            "allowWhileEventOpen" in shortcut ? shortcut.allowWhileEventOpen : false,
          bindings: shortcut.bindings.map((binding) => ({
            keys: binding.keys,
            type: binding.type,
            allowShift: "allowShift" in binding ? binding.allowShift : false,
            hidden: "hidden" in binding ? binding.hidden : false,
            enableOnFormTags: "enableOnFormTags" in binding ? binding.enableOnFormTags : false,
          })),
        },
      })),
    ],
  })
})

it("palette commands", () => {
  writeFixture(CRATE, "palette_commands", {
    source: "src/lib/palette-commands.ts",
    description:
      "Command palette entries in display order. `label` null means the shortcut's label is used; `submenu`/`page` null when absent.",
    cases: [
      { name: "groups", input: null, output: COMMAND_GROUPS },
      ...PALETTE_COMMANDS.map((command) => ({
        name: command.id,
        input: null,
        output: {
          id: command.id,
          group: command.group,
          label: command.label ?? null,
          submenu: command.submenu ?? null,
          page: command.page ?? null,
        },
      })),
    ],
  })
})
