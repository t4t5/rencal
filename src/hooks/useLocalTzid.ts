import { useSyncExternalStore } from "react"

import { getLocalTzid, subscribeLocalTzid } from "@/lib/event-time"

/**
 * The viewer's IANA timezone as reactive state. Re-renders the component when
 * the OS timezone changes, so anything derived from getLocalTzid recomputes.
 */
export function useLocalTzid(): string {
  return useSyncExternalStore(subscribeLocalTzid, getLocalTzid)
}
