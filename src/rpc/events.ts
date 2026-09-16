// Emitted by useTheme after a frontend theme change. Payload: the theme name.
export const THEME_CHANGED = "theme-changed"

// Emitted by Rust's state bridge whenever caldir config changes. Payload:
// CaldirSettings.
export const CALDIR_CONFIG_CHANGED = "caldir-config-changed"
// Emitted by Rust's state bridge when calendars or their metadata change.
export const CALENDARS_CHANGED = "calendars-changed"
// Emitted by Rust's state bridge when external writes change event data.
export const EVENTS_CHANGED = "events-changed"

// Emitted by Rust's deep-link handler when another event URL is queued.
export const EVENT_DEEP_LINK_AVAILABLE = "event-deep-link-available"

// Emitted by Rust's config watcher and SettingsContext when anything in
// ~/.config/rencal/config.toml changes. No payload.
export const RENCAL_CONFIG_CHANGED = "rencal-config-changed"

// Emitted by Rust's timezone watcher. Payload: the new IANA tzid.
export const SYSTEM_TZ_CHANGED = "system-tz-changed"
