import type { ThemeSettings } from "@/lib/api"

import type { Appearance, ThemeDescriptor } from "@/themes/manifest"

/** A settings field holding a theme id. */
export type ThemeSlot = "single" | Appearance

// Keep in step with theme-bootstrap.js and rencal-config's default.
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  single: "ren",
  light: "ren-light",
  dark: "ren",
}

/** On Omarchy, syncing follows the desktop's theme: it shows Omarchy as the single theme. */
export const resolveSync = (settings: ThemeSettings, onOmarchy: boolean): ThemeSettings =>
  onOmarchy && settings.mode === "system"
    ? { ...settings, mode: "single", single: "omarchy" }
    : settings

/** The slot showing: the OS's appearance while syncing with it, otherwise `single`. */
export const activeSlot = (settings: ThemeSettings, os: Appearance): ThemeSlot =>
  settings.mode === "system" ? os : "single"

/** Themes offered for a slot: every theme for `single`, otherwise those of its appearance plus adaptive ones. */
export function themesFor(
  slot: ThemeSlot,
  descriptors: readonly ThemeDescriptor[],
): readonly ThemeDescriptor[] {
  return slot === "single"
    ? descriptors
    : descriptors.filter((theme) => theme.appearance === slot || theme.appearance === "adaptive")
}

export const withSlot = (settings: ThemeSettings, slot: ThemeSlot, id: string): ThemeSettings => ({
  ...settings,
  [slot]: id,
})

/** The showing slot's next theme, in display order. */
export function cycleTheme(
  settings: ThemeSettings,
  descriptors: readonly ThemeDescriptor[],
  os: Appearance,
): ThemeSettings {
  const slot = activeSlot(settings, os)
  const ids = themesFor(slot, descriptors).map((theme) => theme.id)
  const next = ids[(ids.indexOf(settings[slot]) + 1) % ids.length]
  return next === undefined ? settings : withSlot(settings, slot, next)
}
