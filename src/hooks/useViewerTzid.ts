import { useSyncExternalStore } from "react"

import { getViewerTzid, subscribeViewerTzid } from "@/lib/event-time"

/**
 * The viewer's IANA timezone as reactive state. Re-renders the component when
 * the OS timezone changes, so anything derived from getViewerTzid recomputes.
 */
export function useViewerTzid(): string {
  return useSyncExternalStore(subscribeViewerTzid, getViewerTzid)
}
