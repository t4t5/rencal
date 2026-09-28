import type { ThemeSettings } from "@/lib/api"

import {
  type Appearance,
  isOmarchy,
  OMARCHY_THEME_ID,
  type ThemeDescriptor,
} from "@/themes/manifest"

/** A settings field holding a theme id. */
export type ThemeSlot = "single" | Appearance

// Keep in step with rencal-config's default.
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  single: "ren",
  light: "ren-light",
  dark: "ren",
}

/**
 * The theme shown whatever the OS appearance, which forces the window to its
 * own; null while following the OS. On Omarchy, syncing shows Omarchy.
 */
export function forcedTheme(settings: ThemeSettings, onOmarchy: boolean): string | null {
  if (settings.mode === "single") return settings.single
  return onOmarchy ? OMARCHY_THEME_ID : null
}

/** Themes offered for a slot. Omarchy is shown by syncing, so no slot offers it. */
export function themesFor(
  slot: ThemeSlot,
  descriptors: readonly ThemeDescriptor[],
): readonly ThemeDescriptor[] {
  return descriptors.filter(
    (theme) => !isOmarchy(theme.id) && (slot === "single" || theme.appearance === slot),
  )
}

export const withSlot = (settings: ThemeSettings, slot: ThemeSlot, id: string): ThemeSettings => ({
  ...settings,
  [slot]: id,
})

/** Shows `id` as the single theme; Omarchy is shown by syncing instead. */
export const pickTheme = (settings: ThemeSettings, id: string): ThemeSettings =>
  isOmarchy(id) ? { ...settings, mode: "system" } : { ...settings, mode: "single", single: id }

/**
 * The showing theme's next one, in display order: within the OS's slot while
 * following it, otherwise among every theme (on Omarchy, Omarchy too).
 */
export function cycleTheme(
  settings: ThemeSettings,
  descriptors: readonly ThemeDescriptor[],
  onOmarchy: boolean,
  os: Appearance,
): ThemeSettings {
  const forced = forcedTheme(settings, onOmarchy)
  const themes = forced === null ? themesFor(os, descriptors) : descriptors
  const ids = themes.map((theme) => theme.id)
  const next = ids[(ids.indexOf(forced ?? settings[os]) + 1) % ids.length]
  if (next === undefined) return settings
  return forced === null ? withSlot(settings, os, next) : pickTheme(settings, next)
}
