import { nativeModule } from "nsh"

/** The zone data `Backend` in `rencal/native` has (chrono-tz). */
interface NativeZones {
  zoneOffsetMs(tz: string, epochMs: number): number | null
  zoneInstantsMs(tz: string, localMs: number): number[]
  systemZone(): string
  zones(): string[]
  zoneAbbreviation(tz: string, epochMs: number): string | null
}

let backend: NativeZones | undefined

/**
 * `Backend`'s zone functions, looked up rather than imported: view plugins'
 * engines get renCal's crate too, but their bundles can't import
 * `rencal/native`, so the SDK runs `lib/temporal.ts` and `lib/event-time` on this.
 */
export const nativeZones = (): NativeZones =>
  (backend ??= nativeModule<{ Backend: NativeZones }>("rencal/native").Backend)
