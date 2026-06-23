// Events triggered by SettingsWindow that update the view in AppWindow
export const TIME_FORMAT_CHANGED = "time-format-changed"
export const DEFAULT_REMINDERS_CHANGED = "default-reminders-changed"
export const DEFAULT_CALENDAR_CHANGED = "default-calendar-changed"
export const CALENDAR_DIR_CHANGED = "calendar-dir-changed"
export const CALDIR_CHANGED = "caldir-changed"
export const THEME_CHANGED = "theme-changed"
export const NOTIFICATIONS_ENABLED_CHANGED = "notifications-enabled-changed"
export const AUTO_SYNC_ENABLED_CHANGED = "auto-sync-enabled-changed"
// Emitted by the backend config watcher when ~/.config/rencal/config.toml
// changes on disk (e.g. a hand-edit to the [groups] table).
export const CONFIG_CHANGED = "config-changed"
