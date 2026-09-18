import { rpc } from "@/rpc"
import type { SyncPreview } from "@/rpc/bindings"

export type { SyncPreview }

/** What a sync would push and pull per provider calendar, without applying it. */
export function getSyncPreview(): Promise<SyncPreview[]> {
  return rpc.caldir.sync_preview()
}

/**
 * Sync every provider calendar. Calendars whose pending deletes exceed the
 * backend's mass-delete guard are skipped unless listed in `allowMassDelete`.
 */
export async function syncCalendars(allowMassDelete: string[]): Promise<void> {
  await rpc.caldir.sync(allowMassDelete)
}

/** Drop pending local changes instead of pushing them. */
export async function discardPendingChanges(): Promise<void> {
  await rpc.caldir.discard()
}
