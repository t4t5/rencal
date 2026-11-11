/*
 * Owns the theme settings and draws them. config.toml is canonical; omarchy and
 * external themes arrive as backend events, so switching any of them is live.
 */
import { colorScheme, computed, effect, setColorScheme, signal } from "nsh"

import {
  api,
  type ExternalTheme,
  type ExternalThemeError,
  type OmarchyColors,
  type ThemeMode,
  type ThemeSettings,
} from "@/lib/api"
import { logger } from "@/lib/logger"

import builtin from "./builtin.json"
import { externalThemeDescriptor, parseThemeCss } from "./external"
import { loadThemeFonts, withThemeFonts } from "./fonts"
import { applyTheme, type Vars } from "./index"
import {
  type Appearance,
  BUILTIN_DESCRIPTORS,
  getDeclaredAppearance,
  isOmarchy,
  omarchyDescriptor,
  type ThemeDescriptor,
} from "./manifest"
import { omarchyVars } from "./omarchy"
import {
  cycleTheme as nextCycled,
  DEFAULT_THEME_SETTINGS,
  forcedTheme,
  pickTheme as picked,
  type ThemeSlot,
  withSlot,
} from "./theme-settings"

const settingsValue = signal<ThemeSettings>(DEFAULT_THEME_SETTINGS)
const externalThemeList = signal<ExternalTheme[]>([])
const errors = signal<ExternalThemeError[]>([])
const omarchy = signal<OmarchyColors | null>(null)
const os = signal<Appearance>("dark")

export const themeSettings = () => settingsValue()
export const externalThemes = () => externalThemeList()
export const externalThemeErrors = () => errors()

/** Omarchy is installed, so syncing follows its theme. */
export const onOmarchy = () => omarchy() !== null

export const themeDescriptors = computed<ThemeDescriptor[]>(() => {
  const palette = omarchy()
  return [
    ...(palette ? [omarchyDescriptor(palette.mode)] : []),
    ...BUILTIN_DESCRIPTORS,
    ...externalThemeList().map(externalThemeDescriptor),
  ]
})

const forced = computed(() => forcedTheme(settingsValue(), onOmarchy()))

// An unknown theme (a user theme not loaded yet) renders the dark ren baseline.
const forcedAppearance = computed<Appearance | null>(() => {
  const id = forced()
  return id === null ? null : (getDeclaredAppearance(id, themeDescriptors()) ?? "dark")
})

export const activeTheme = computed(() => forced() ?? settingsValue()[os()])

const appearance = computed<Appearance>(
  () => forcedAppearance() ?? getDeclaredAppearance(activeTheme(), themeDescriptors()) ?? os(),
)

/** What a theme sets over the baseline. */
export function themeVars(id: string): Vars {
  const palette = omarchy()
  if (isOmarchy(id) && palette) return omarchyVars(palette)
  const external = externalThemeList().find((theme) => theme.id === id)
  if (external) return withThemeFonts(parseThemeCss(external.css).vars)
  return (builtin as Record<string, Vars>)[id] ?? {}
}

/** How many selectors of a theme's CSS NSH can't draw. */
export function undrawnSelectors(id: string): number {
  const external = externalThemeList().find((theme) => theme.id === id)
  return external ? parseThemeCss(external.css).selectors : 0
}

function isThemeSettings(value: unknown): value is ThemeSettings {
  const settings = value as Partial<ThemeSettings> | null
  return (
    (settings?.mode === "system" || settings?.mode === "single") &&
    typeof settings.single === "string" &&
    typeof settings.light === "string" &&
    typeof settings.dark === "string"
  )
}

function setSettings(next: ThemeSettings) {
  settingsValue.set(next)
  api.themes
    .setConfigured(next)
    .catch((error: unknown) => logger.error("Failed to persist theme:", error))
}

export const setThemeMode = (mode: ThemeMode) => setSettings({ ...settingsValue(), mode })

export const setThemeSlot = (slot: ThemeSlot, id: string) =>
  setSettings(withSlot(settingsValue(), slot, id))

/** Shows a theme as the single theme, or syncs for Omarchy (command palette). */
export const pickTheme = (id: string) => setSettings(picked(settingsValue(), id))

/** The showing slot's next theme (shortcut). */
export const cycleTheme = () =>
  setSettings(nextCycled(settingsValue(), themeDescriptors(), onOmarchy(), os()))

async function loadExternalThemes() {
  try {
    const snapshot = await api.themes.listExternal()
    externalThemeList.set(snapshot.themes)
    errors.set(snapshot.errors)
  } catch (error) {
    logger.error("Failed to load external themes", error)
  }
}

/** Draws the saved theme, and from then on whatever it changes to. */
export async function startThemes() {
  const [configured, palette] = await Promise.all([
    api.themes.getConfigured(),
    api.themes.getOmarchyColors(),
    loadExternalThemes(),
  ])
  if (isThemeSettings(configured)) settingsValue.set(configured)
  omarchy.set(palette)

  api.notifications.listen("theme-changed", (next) => {
    if (isThemeSettings(next)) settingsValue.set(next)
  })
  api.notifications.listen("omarchy-theme-changed", (next) => omarchy.set(next))
  api.notifications.listen("external-themes-changed", (snapshot) => {
    externalThemeList.set(snapshot.themes)
    errors.set(snapshot.errors)
  })

  // A forced window hides the OS appearance, so while forced `os` keeps the last one read.
  effect(() => setColorScheme(forcedAppearance() ?? "system"))
  effect(() => {
    if (forcedAppearance() === null) os.set(colorScheme())
  })

  effect(() => {
    const external = externalThemeList().find((theme) => theme.id === activeTheme())
    if (external) void loadThemeFonts(external)
  })

  await new Promise<void>((drawn) => {
    effect(() => {
      applyTheme(themeVars(activeTheme()), appearance())
        .catch((error: unknown) => logger.error("Failed to draw the theme:", error))
        .finally(drawn)
    })
  })
}
