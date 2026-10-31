import { describe, expect, it } from "vitest"

import {
  COMMANDS,
  CommandError,
  type CommandValues,
  describeAction,
  parseAction,
  resolveInvocation,
} from "@/lib/commands"

const values: CommandValues = {
  "view.switch": [
    { value: "week", label: "Display week view" },
    { value: "t4t5.board/board", label: "Display board view" },
  ],
}

const resolve = (invocation: Parameters<typeof resolveInvocation>[0]) =>
  resolveInvocation(invocation, values)

describe("parseAction", () => {
  it("splits a bound value at the first colon", () => {
    expect(parseAction("date.today")).toEqual({ command: "date.today" })
    expect(parseAction("view.switch:t4t5.board/board")).toEqual({
      command: "view.switch",
      value: "t4t5.board/board",
    })
  })
})

describe("resolveInvocation", () => {
  it("fills the first argument from a bound or given value", () => {
    expect(resolve({ command: "date.next:day" }).args).toEqual({ unit: "day" })
    expect(resolve({ command: "date.next", value: "week" }).args).toEqual({ unit: "week" })
    expect(resolve({ command: "date.next", args: { unit: "month" } }).args).toEqual({
      unit: "month",
    })
  })

  it("reports the first missing required argument", () => {
    expect(resolve({ command: "date.go" }).missing?.name).toBe("date")
    expect(resolve({ command: "date.today" }).missing).toBeUndefined()
  })

  it("checks values against fixed and run-time choices", () => {
    expect(() => resolve({ command: "date.next:year" })).toThrow(/use one of "day", "week"/)
    expect(() => resolve({ command: "view.switch:nope" })).toThrow(CommandError)
    expect(resolve({ command: "view.switch:t4t5.board/board" }).args.view).toBe("t4t5.board/board")
  })

  it("rejects what the command doesn't take", () => {
    expect(() => resolve({ command: "nope.nope" })).toThrow(/Unknown command "nope.nope"/)
    expect(() => resolve({ command: "date.today", value: "x" })).toThrow(/takes no arguments/)
    expect(() => resolve({ command: "date.next", args: { units: "day" } })).toThrow(
      /no argument "units"; it takes "unit"/,
    )
    expect(() => resolve({ command: "date.next:day", value: "week" })).toThrow(/one value/)
    expect(() => resolve({ command: "date.next", value: "day", args: { unit: "week" } })).toThrow(
      /once/,
    )
  })
})

describe("describeAction", () => {
  it("names bound values by their label", () => {
    expect(describeAction("date.next:day", values)).toEqual({
      label: "Next day",
      group: "Navigation",
    })
    expect(describeAction("view.switch:week", values)?.label).toBe("Display week view")
    expect(describeAction("view.switch:gone", values)?.label).toBe("Switch view: gone")
    expect(describeAction("nope", values)).toBeUndefined()
  })
})

describe("COMMANDS", () => {
  it("has unique ids", () => {
    const ids = COMMANDS.map((command) => command.id)
    expect(ids).toEqual([...new Set(ids)])
  })
})
