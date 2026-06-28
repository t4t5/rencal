import { useEffect } from "react"

import { checkForUpdate, promptAndInstall } from "@/lib/updater"

/**
 * Runs the startup update check in the main window. On mount it looks for a
 * newer release and, if one exists, shows the native download prompt. Renders
 * nothing — the native dialog is the only UI.
 */
export function UpdateChecker() {
  useEffect(() => {
    void (async () => {
      const update = await checkForUpdate()
      if (update) await promptAndInstall(update)
    })()
  }, [])

  return null
}
