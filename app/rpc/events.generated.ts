// Mirrors `AppEvent` in native/src/events.rs; keep the two in step.
import type {
  CaldirSettings,
  ExternalThemesSnapshot,
  ExternalViewsSnapshot,
  KeysSnapshot,
  OmarchyColors,
  ThemeSettings,
} from "./bindings"

export type AppEvent =
  | { name: "caldir-config-changed"; payload: CaldirSettings }
  | { name: "calendars-changed"; payload: null }
  | { name: "events-changed"; payload: null }
  | { name: "providers-changed"; payload: null }
  | { name: "event-deep-link-available"; payload: null }
  | { name: "plugin-deep-link-available"; payload: null }
  | { name: "ics-file-available"; payload: null }
  | { name: "rencal-config-changed"; payload: null }
  | { name: "system-tz-changed"; payload: string }
  | { name: "omarchy-theme-changed"; payload: OmarchyColors }
  | { name: "external-themes-changed"; payload: ExternalThemesSnapshot }
  | { name: "external-views-changed"; payload: ExternalViewsSnapshot }
  | { name: "keys-changed"; payload: KeysSnapshot }
  /**
   * `rencal do` queued a command; drain it with `commands.take_pending`.
   */
  | { name: "command-requested"; payload: null }
  | { name: "theme-changed"; payload: ThemeSettings }

export type AppEventName = AppEvent["name"]
export type AppEventPayload<N extends AppEventName> = Extract<AppEvent, { name: N }>["payload"]
