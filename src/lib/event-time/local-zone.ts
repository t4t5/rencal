/**
 * The viewer's IANA timezone, for example "Europe/Stockholm". Cached for the
 * lifetime of the JS context because Intl.DateTimeFormat construction is
 * comparatively expensive and the viewer's zone effectively does not change
 * mid-session.
 */
let cachedLocalTzid: string | undefined

export function getLocalTzid(): string {
  if (cachedLocalTzid === undefined) {
    cachedLocalTzid = Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return cachedLocalTzid
}
