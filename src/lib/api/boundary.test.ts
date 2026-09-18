import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

// Lints small fixtures against the real config so the boundary in
// eslint.config.mjs cannot silently loosen.
const eslint = new ESLint({ cwd: process.cwd() })

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId ?? message.message)
}

const restricted = ["no-restricted-imports"]

describe("app API boundary", () => {
  it.each([
    ["src/components/toolbar/Foo.tsx", 'import { rpc } from "@/rpc"'],
    ["src/components/toolbar/Foo.tsx", 'import type { Calendar } from "@/rpc/bindings"'],
    ["src/contexts/FooContext.tsx", 'import type { AppEvent } from "@/rpc/events.generated"'],
    ["src/hooks/useFoo.ts", 'import { listen } from "@tauri-apps/api/event"'],
    ["src/lib/foo.ts", 'import { rpc } from "@/rpc"'],
    ["src/lib/cal-events.ts", 'import { rpc } from "@/rpc"'],
    ["src/lib/api/foo.ts", 'import { emit } from "@tauri-apps/api/event"'],
    ["src/lib/api/foo.ts", 'import { rpc } from "../rpc"'],
  ])("rejects %s importing %s", async (filePath, code) => {
    expect(await violations(filePath, code)).toEqual(restricted)
  })

  it.each([
    ["src/lib/api/calendars.ts", 'import { rpc } from "@/rpc"'],
    ["src/lib/api/events.ts", 'import { listen } from "@tauri-apps/api/event"'],
    ["src/lib/cal-events.ts", 'import type { RpcRecurrence } from "@/rpc/bindings"'],
    ["src/lib/event-time/rpc.ts", 'import type { RpcEventTime } from "@/rpc/bindings"'],
    ["src/components/toolbar/Foo.tsx", 'import type { Calendar } from "@/lib/api/calendars"'],
    ["src/hooks/useFoo.ts", 'import { getCurrentWindow } from "@tauri-apps/api/window"'],
  ])("permits %s importing %s", async (filePath, code) => {
    expect(await violations(filePath, code)).toEqual([])
  })
})
