/*
 * Plugin themes ship their fonts. The backend writes each file's declared
 * family, weight and style into it, as `@font-face` would, so a theme's font
 * tokens name what NSH registers.
 */
import { registerFont } from "nsh"

import { api, type ExternalTheme } from "@/lib/api"
import { logger } from "@/lib/logger"

const requested = new Set<string>()

/** Registers the fonts of `theme`'s plugin, once; NSH keeps them for the process. */
export async function loadThemeFonts(theme: ExternalTheme): Promise<void> {
  if (theme.source.kind !== "plugin" || requested.has(theme.id)) return
  requested.add(theme.id)
  try {
    const { fonts } = await api.themes.loadFonts(theme.id)
    for (const font of fonts) {
      await registerFont(Uint8Array.from(Buffer.from(font.data, "base64")))
    }
  } catch (error) {
    requested.delete(theme.id)
    logger.error(`Failed to load the fonts of ${theme.id}:`, error)
  }
}
