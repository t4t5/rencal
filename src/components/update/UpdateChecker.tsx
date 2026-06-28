import { useEffect } from "react"

import { checkForUpdate, promptAndInstall } from "@/lib/updater"

// Checks for newer release on mount (macOS only):
export function UpdateChecker() {
  useEffect(() => {
    void (async () => {
      const update = await checkForUpdate()
      if (update) await promptAndInstall(update)
    })()
  }, [])

  return null
}
