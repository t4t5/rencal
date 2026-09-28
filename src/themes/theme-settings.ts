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

/** Themes offered for a slot. Adaptive themes (Omarchy) are shown by syncing, so no slot offers them. */
export function themesFor(
  slot: ThemeSlot,
  descriptors: readonly ThemeDescriptor[],
): readonly ThemeDescriptor[] {
  return descriptors.filter((theme) =>
    slot === "single" ? theme.appearance !== "adaptive" : theme.appearance === slot,
  )
}

export const withSlot = (settings: ThemeSettings, slot: ThemeSlot, id: string): ThemeSettings => ({
  ...settings,
  [slot]: id,
})

/** Shows `id` as the single theme; an adaptive theme (Omarchy) is shown by syncing instead. */
export function pickTheme(
  settings: ThemeSettings,
  id: string,
  descriptors: readonly ThemeDescriptor[],
): ThemeSettings {
  const adaptive = descriptors.some((theme) => theme.id === id && theme.appearance === "adaptive")
  return adaptive ? { ...settings, mode: "system" } : { ...settings, mode: "single", single: id }
}

/**
 * The showing slot's next theme, in display order. `settings` is resolved
 * (`resolveSync`), so on Omarchy the single list includes Omarchy, picked by syncing.
 */
export function cycleTheme(
  settings: ThemeSettings,
  descriptors: readonly ThemeDescriptor[],
  os: Appearance,
): ThemeSettings {
  const slot = activeSlot(settings, os)
  const themes = slot === "single" ? descriptors : themesFor(slot, descriptors)
  const ids = themes.map((theme) => theme.id)
  const next = ids[(ids.indexOf(settings[slot]) + 1) % ids.length]
  if (next === undefined) return settings
  return slot === "single" ? pickTheme(settings, next, descriptors) : withSlot(settings, slot, next)
}
