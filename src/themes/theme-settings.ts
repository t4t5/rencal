import type { ThemeSettings } from "@/lib/api"

import {
  type Appearance,
  type ThemeAppearance,
  type ThemeDescriptor,
  themesFor,
} from "@/themes/manifest"

export type ResolvedTheme = {
  activeSlot: Appearance
  activeTheme: string
  /** Leave the window unforced and track the OS: only when the OS picks between different themes. */
  followsSystem: boolean
}

export const followsSystem = (settings: ThemeSettings) =>
  settings.mode === "system" && settings.light !== settings.dark

export function resolveTheme(settings: ThemeSettings, os: Appearance): ResolvedTheme {
  const activeSlot = settings.mode === "system" ? os : settings.mode
  return {
    activeSlot,
    activeTheme: settings[activeSlot],
    followsSystem: followsSystem(settings),
  }
}

export const withSlot = (settings: ThemeSettings, slot: Appearance, id: string): ThemeSettings =>
  slot === "light" ? { ...settings, light: id } : { ...settings, dark: id }

/**
 * Show `id` now: a `system` theme fills both slots; any other fills its
 * appearance's slot (the active one when unknown), and pins the mode to that
 * slot if it wouldn't be showing.
 */
export function pickTheme(
  settings: ThemeSettings,
  id: string,
  appearance: ThemeAppearance | null,
  os: Appearance,
): ThemeSettings {
  if (appearance === "system") return { ...settings, light: id, dark: id }
  const slot = appearance ?? resolveTheme(settings, os).activeSlot
  const next = withSlot(settings, slot, id)
  return resolveTheme(next, os).activeSlot === slot ? next : { ...next, mode: slot }
}

/** The active slot's next theme, in display order. */
export function cycleTheme(
  settings: ThemeSettings,
  descriptors: readonly ThemeDescriptor[],
  os: Appearance,
): ThemeSettings {
  const { activeSlot, activeTheme } = resolveTheme(settings, os)
  const ids = themesFor(activeSlot, descriptors).map((theme) => theme.id)
  const next = ids[(ids.indexOf(activeTheme) + 1) % ids.length]
  return next === undefined ? settings : withSlot(settings, activeSlot, next)
}
