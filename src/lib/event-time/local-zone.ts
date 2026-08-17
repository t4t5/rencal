import { Temporal } from "@js-temporal/polyfill"

/**
 * The viewer's IANA timezone, for example "Europe/Stockholm". Seeded from Intl
 * once (construction is comparatively expensive), then kept current by the
 * Rust-side timezone watcher via setViewerTzid — the webview's own Intl zone is
 * fixed at process start, so it cannot be re-read after an OS timezone change.
 */
let cachedViewerTzid: string | undefined

const subscribers = new Set<() => void>()

export function getViewerTzid(): string {
  if (cachedViewerTzid === undefined) {
    cachedViewerTzid = Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return cachedViewerTzid
}

/**
 * Update the viewer's zone after an OS timezone change (wired to the
 * SYSTEM_TZ_CHANGED event in main.tsx) and notify subscribers.
 */
export function setViewerTzid(tzid: string): void {
  if (tzid === getViewerTzid()) return
  try {
    Temporal.Now.zonedDateTimeISO(tzid)
  } catch {
    console.warn(`Ignoring unknown IANA timezone "${tzid}"`)
    return
  }
  cachedViewerTzid = tzid
  for (const notify of subscribers) notify()
}

/** Subscribe to viewer-zone changes. Returns an unsubscribe function. */
export function subscribeViewerTzid(onChange: () => void): () => void {
  subscribers.add(onChange)
  return () => {
    subscribers.delete(onChange)
  }
}
