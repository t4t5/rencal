import { ask } from "@tauri-apps/plugin-dialog"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"

import { isMacOS } from "@/lib/utils"

export type { Update }

/**
 * Checks GitHub releases for a newer signed build.
 *
 * Returns the available `Update`, or `null` when there's nothing to do:
 * non-macOS (Linux installs are package-manager managed and can't self-update),
 * dev builds, the app is already up to date, or the check failed — we never
 * nag the user when a check fails.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isMacOS || !import.meta.env.PROD) return null

  try {
    return await check()
  } catch {
    return null
  }
}

/**
 * Shows a native "Download it?" prompt for an available update. On confirm,
 * downloads + installs the signed bundle and relaunches into the new version.
 */
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
