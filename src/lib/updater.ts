import { t } from "@lingui/core/macro"
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
  const version = update.version
  const confirmed = await ask(t`renCal v${version} is available. Download and install it now?`, {
    title: t`Update available`,
    kind: "info",
    okLabel: t({ message: "Download", context: "update dialog button" }),
    cancelLabel: t({ message: "Later", context: "update dialog button" }),
  })

  if (!confirmed) return

  await update.downloadAndInstall()
  await relaunch()
}
