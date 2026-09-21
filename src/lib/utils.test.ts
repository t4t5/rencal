import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges the themeable circle radius with Tailwind radius classes", () => {
    expect(cn("rounded-md", "rounded-circle")).toBe("rounded-circle")
    expect(cn("rounded-circle", "rounded-md")).toBe("rounded-md")
    expect(cn("rounded-md", "rounded-base")).toBe("rounded-base")
  })
})
