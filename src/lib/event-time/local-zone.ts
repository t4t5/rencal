import { Temporal } from "@js-temporal/polyfill"

/**
 * The viewer's IANA timezone, for example "Europe/Stockholm". Seeded from Intl
 * once (construction is comparatively expensive), then kept current by the
 * Rust-side timezone watcher via setLocalTzid — the webview's own Intl zone is
 * fixed at process start, so it cannot be re-read after an OS timezone change.
 */
let cachedLocalTzid: string | undefined

const subscribers = new Set<() => void>()

export function getLocalTzid(): string {
  if (cachedLocalTzid === undefined) {
    cachedLocalTzid = Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return cachedLocalTzid
}

/**
 * Update the viewer's zone after an OS timezone change (wired to the
 * SYSTEM_TZ_CHANGED event in main.tsx) and notify subscribers.
 */
export function setLocalTzid(tzid: string): void {
  if (tzid === getLocalTzid()) return
  try {
    Temporal.Now.zonedDateTimeISO(tzid)
  } catch {
    console.warn(`Ignoring unknown IANA timezone "${tzid}"`)
    return
  }
  cachedLocalTzid = tzid
  for (const notify of subscribers) notify()
}

/** Subscribe to viewer-zone changes. Returns an unsubscribe function. */
export function subscribeLocalTzid(onChange: () => void): () => void {
  subscribers.add(onChange)
  return () => {
    subscribers.delete(onChange)
  }
}
