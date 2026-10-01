import { rpc } from "@/rpc"
import type { SyncFailure, SyncPreview, SyncPreviewResult } from "@/rpc/bindings"

export type { SyncFailure, SyncPreview }

/**
 * What a sync would push and pull per provider calendar, without applying it.
 * Calendars that fail are listed in `failures`; the rest still preview.
 */
export function getSyncPreview(): Promise<SyncPreviewResult> {
  return rpc.caldir.sync_preview()
}

/**
 * Sync every provider calendar. Calendars whose pending deletes exceed the
 * backend's mass-delete guard are skipped unless listed in `allowMassDelete`.
 * Resolves with the calendars that failed; the rest still sync.
 */
export function syncCalendars(allowMassDelete: string[]): Promise<SyncFailure[]> {
  return rpc.caldir.sync(allowMassDelete)
}

/** Drop pending local changes instead of pushing them. Resolves with the calendars that failed. */
export function discardPendingChanges(): Promise<SyncFailure[]> {
  return rpc.caldir.discard()
}

export const sync = {
  preview: getSyncPreview,
  run: syncCalendars,
  discardPendingChanges,
} as const
