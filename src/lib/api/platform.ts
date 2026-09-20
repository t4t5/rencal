import { rpc } from "@/rpc"
import type { EventDeepLink } from "@/rpc/bindings"

/** Whether new windows need OS-drawn decorations on this platform/compositor. */
export function needsNativeDecorations(): Promise<boolean> {
  return rpc.platform.needs_native_decorations()
}

/** Drain `rencal://` event links queued since the last call. */
export function takePendingEventLinks(): Promise<EventDeepLink[]> {
  return rpc.platform.take_pending_event_links()
}

/** Check for a queued plugin link without taking it from the settings window. */
export function hasPendingPluginInstall(): Promise<boolean> {
  return rpc.platform.has_pending_plugin_install()
}
