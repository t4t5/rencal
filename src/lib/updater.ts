import { ask } from "@tauri-apps/plugin-dialog"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"

import { isMacOS } from "@/lib/utils"

export type { Update }

// Checks GitHub releases for a newer signed build.
// (macOS only)
export async function checkForUpdate(): Promise<Update | null> {
  if (!isMacOS || !import.meta.env.PROD) return null

  try {
    return await check()
  } catch {
    return null
  }
}

export async function promptAndInstall(update: Update): Promise<void> {
  const confirmed = await ask(
    `renCal v${update.version} is available. Download and install it now?`,
    {
      title: "Update available",
      kind: "info",
      okLabel: "Download",
      cancelLabel: "Later",
    },
  )

  if (!confirmed) return

  await update.downloadAndInstall()
  await relaunch()
}
