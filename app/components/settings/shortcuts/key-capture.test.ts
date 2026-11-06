import { keysError, toKeystroke } from "@/lib/key-bindings"
import { describe, expect, it } from "@/lib/testing/vitest"

import { allKeystrokes, keysFromKeystroke } from "./key-capture"

describe("keysFromKeystroke", () => {
  it("writes keys as keys.toml does", () => {
    expect(keysFromKeystroke("k")).toBe("k")
    expect(keysFromKeystroke("shift+k")).toBe("shift+k")
    expect(keysFromKeystroke("mod+shift+t")).toBe("mod+shift+t")
    expect(keysFromKeystroke("shift+/")).toBe("?")
    expect(keysFromKeystroke("mod+,")).toBe("mod+comma")
    expect(keysFromKeystroke("left")).toBe("left")
  })

  it("is what `toKeystroke` turns back into the same keystroke", () => {
    for (const keystroke of allKeystrokes()) {
      const keys = keysFromKeystroke(keystroke)
      expect(keysError(keys)).toBeNull()
      expect(toKeystroke(keys)).toBe(keystroke.replace("minus", "-").replace("plus", "="))
    }
  })
})
