import type { Messages } from "@lingui/core"

/**
 * Compiled messages for one catalog language. The .po files next to this module
 * are compiled on import by @lingui/vite-plugin; each language is its own chunk.
 */
export async function loadCatalog(language: string): Promise<Messages> {
  const { messages } = await import(`./${language}/messages.po`)
  return messages
}
