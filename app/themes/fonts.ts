/*
 * Plugin themes ship their fonts. NSH registers each under the family its file
 * names, which can differ from the one the theme's CSS asks for, so the theme's
 * font tokens are rewritten to the registered names.
 */
import { registerFont, signal } from "nsh"

import { api, type ExternalTheme } from "@/lib/api"
import { logger } from "@/lib/logger"

import type { Vars } from "./index"

/** Registered family by the family a theme declared. */
const families = signal<Record<string, string>>({})
const requested = new Set<string>()

/** Registers the fonts of `theme`'s plugin, once; NSH keeps them for the process. */
export async function loadThemeFonts(theme: ExternalTheme): Promise<void> {
  if (theme.source.kind !== "plugin" || requested.has(theme.id)) return
  requested.add(theme.id)
  try {
    const { fonts } = await api.themes.loadFonts(theme.id)
    const named: Record<string, string> = {}
    for (const font of fonts) {
      const { family } = await registerFont(Uint8Array.from(Buffer.from(font.data, "base64")))
      named[font.family] = family
    }
    families.update((known) => ({ ...known, ...named }))
  } catch (error) {
    requested.delete(theme.id)
    logger.error(`Failed to load the fonts of ${theme.id}:`, error)
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** `vars` with each declared family in a font token replaced by its registered one. */
export function withThemeFonts(vars: Vars): Vars {
  const known = Object.entries(families())
  if (known.length === 0) return vars
  return Object.fromEntries(
    Object.entries(vars).map(([name, value]) => {
      if (!name.startsWith("font-")) return [name, value]
      const replaced = known.reduce(
        (list, [declared, family]) =>
          list.replace(new RegExp(`(["']?)${escape(declared)}\\1`, "g"), `"${family}"`),
        value,
      )
      return [name, replaced]
    }),
  )
}
