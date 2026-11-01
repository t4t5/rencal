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

/** The next .ics file the OS asked renCal to open, if any. Taking it removes it. */
export function takePendingIcsFile(): Promise<string | null> {
  return rpc.platform.take_pending_ics_file()
}
