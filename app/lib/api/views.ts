import { rpc } from "@/rpc"
import type { ExternalView, ExternalViewsSnapshot } from "@/rpc/bindings"

export type { ExternalView, ExternalViewsSnapshot }

/** Views contributed by installed plugins; `external-views-changed` reports later edits. */
export function listExternalViews(): Promise<ExternalViewsSnapshot> {
  return rpc.views.list_external()
}

export const views = {
  listExternal: listExternalViews,
} as const
