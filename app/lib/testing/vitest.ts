/* `nsh.json` aliases vitest here, so the tests of `src/lib` run unchanged on QuickJS. */
import { expect as nshExpect, test } from "nsh/test"

import { setNow } from "@/lib/temporal"

export { afterAll, afterEach, beforeAll, beforeEach, describe } from "nsh/test"

/** vitest's second argument labels a failure; NSH's report has its own. */
export const expect = (value: unknown, _message?: string) => nshExpect(value)

function each<T>(cases: readonly T[]) {
  return (name: string, body: (...args: T extends readonly unknown[] ? T : [T]) => void) => {
    for (const row of cases) {
      const args = (Array.isArray(row) ? row : [row]) as T extends readonly unknown[] ? T : [T]
      test(`${name} ${JSON.stringify(row)}`, () => body(...args))
    }
  }
}

export const it = Object.assign((name: string, body: () => void) => test(name, body), { each })

/** The one fake `rrule-utils.test.ts` needs: a pinned `Temporal.Now`. */
export const vi = {
  useFakeTimers() {},
  setSystemTime: (date: Date) => setNow(date.getTime()),
  useRealTimers: () => setNow(null),
}
