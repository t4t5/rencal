// Events triggered by SettingsWindow that update the view in AppWindow
export const TIME_FORMAT_CHANGED = "time-format-changed"
export const DEFAULT_REMINDERS_CHANGED = "default-reminders-changed"
export const DEFAULT_CALENDAR_CHANGED = "default-calendar-changed"
export const THEME_CHANGED = "theme-changed"

// Emitted by Rust when the caldir data directory moves (Settings UI, a
// hand-edited caldir config.toml). Payload: the new path, tildified.
export const CALENDAR_DIR_CHANGED = "calendar-dir-changed"

// Emitted by Rust when calendar data changes on disk or a calendar is
// created/deleted/recoloured:
export const CALDIR_CHANGED = "caldir-changed"

export const EVENT_DEEP_LINK_AVAILABLE = "event-deep-link-available"

// Emitted when anything in ~/.config/rencal/config.toml changes:
export const RENCAL_CONFIG_CHANGED = "rencal-config-changed"

// Emitted by the Rust timezone watcher with the new IANA tzid as payload:
export const SYSTEM_TZ_CHANGED = "system-tz-changed"
