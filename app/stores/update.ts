/*
 * App updates: a check at launch, then the download and the swap when the user
 * agrees. Where the app can't replace itself (a system package), the update
 * opens its download instead.
 */
import { openUrl, signal, untracked } from "nsh"
import { type AppUpdate, checkForUpdate, downloadUpdate, installAndRestart } from "nsh/updater"

import { getErrorMessage } from "@/lib/api"
import { logger } from "@/lib/logger"

export type UpdatePhase = "idle" | "downloading" | "installing"

const update = signal<AppUpdate | null>(null)
const phase = signal<UpdatePhase>("idle")
const progress = signal<number | null>(null)
const error = signal<string | null>(null)
const prompt = signal(false)

export const availableUpdate = () => update()
export const updatePhase = () => phase()
/** The download's share done, 0 to 1; null while its size isn't known. */
export const updateProgress = () => progress()
export const updateError = () => error()
export const updatePromptOpen = () => prompt()

/** What the install action says: `idle`, or how far the update has come. */
export function updateActionLabel(idle: string) {
  if (phase() === "installing") return "Installing…"
  if (phase() !== "downloading") return idle
  const share = progress()
  return share === null ? "Downloading…" : `Downloading ${Math.round(share * 100)}%`
}

export const closeUpdatePrompt = () => prompt.set(false)

/** Downloads the update and restarts into it, or opens its download. */
export async function installUpdate() {
  const found = untracked(update)
  if (!found || untracked(phase) !== "idle") return
  if (!found.canInstall) {
    prompt.set(false)
    await openUrl(found.url)
    return
  }
  error.set(null)
  progress.set(null)
  phase.set("downloading")
  try {
    await downloadUpdate(({ received, total }) => progress.set(total ? received / total : null))
    phase.set("installing")
    // Settles only on failure: the app quits and the new version starts.
    await installAndRestart()
  } catch (e) {
    logger.error("Update failed:", e)
    error.set(getErrorMessage(e, "The update couldn’t be installed"))
    phase.set("idle")
  }
}

/** Checks once at launch, and asks about an update the app can install itself. */
export function startUpdates() {
  checkForUpdate()
    .then((found) => {
      update.set(found)
      if (found?.canInstall) prompt.set(true)
    })
    .catch((e: unknown) => logger.warn("Update check failed:", e))
}
