import { describe, expect, it } from "vitest"

import {
  commandGroupLabel,
  commandLabel,
  commandPaletteLabel,
  commandPromptTexts,
  describeCommandAction,
  viewSwitchLabel,
} from "./command-labels"
import { COMMAND_GROUPS, COMMANDS, findCommand } from "./commands"

const command = (id: string) => {
  const found = findCommand(id)
  if (!found) throw new Error(`no command ${id}`)
  return found
}

describe("command labels (English source text)", () => {
  it.each(COMMANDS.map((c) => [c.id, c.label]))("%s reads as the registry says", (id, label) => {
    expect(commandLabel(command(id))).toBe(label)
  })

  it.each(COMMAND_GROUPS.map((group) => [group]))("group %s keeps its name", (group) => {
    expect(commandGroupLabel(group)).toBe(group)
  })

  it("uses the palette label where the registry gives one", () => {
    expect(commandPaletteLabel(command("search.open"))).toBe("Search events…")
    expect(commandPaletteLabel(command("date.today"))).toBe("Go to today")
  })

  it.each([
    ["date.next:day", "Next day", "Navigation"],
    ["date.prev:month", "Previous month", "Navigation"],
    ["app.sync", "Sync now", "General"],
  ])("describes %s as %s", (action, label, group) => {
    expect(describeCommandAction(action, {})).toEqual({ label, group })
  })

  it("describes a bound value by the label the app gives it", () => {
    const values = { "theme.set": [{ value: "nord", label: "Nord" }] }
    expect(describeCommandAction("theme.set:nord", values)?.label).toBe("Nord")
  })

  it("names an unknown value after the command", () => {
    expect(describeCommandAction("theme.set:gone", {})?.label).toBe("Set theme…: gone")
  })

  it("leaves unknown commands undescribed", () => {
    expect(describeCommandAction("nope", {})).toBeUndefined()
  })

  it("labels switching to a view by its name", () => {
    expect(viewSwitchLabel({ id: "week", name: "Week" })).toBe("Display week view")
    expect(viewSwitchLabel({ id: "board", name: "Board" })).toBe("Display board view")
  })

  it("words a prompt after the argument it asks for", () => {
    expect(commandPromptTexts("theme")).toEqual({
      heading: "Theme",
      placeholder: "Search themes…",
      empty: "No themes found.",
    })
    expect(commandPromptTexts("color")).toEqual({
      heading: "Color",
      placeholder: "Search colors…",
      empty: "No colors found.",
    })
  })
})
