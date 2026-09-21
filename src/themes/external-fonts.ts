import { api, type ExternalTheme, type ExternalThemeFont } from "@/lib/api"

type CachedPackage = {
  faces: FontFace[]
}

function packageKey(theme: ExternalTheme): string | null {
  if (theme.source.kind !== "plugin") return null
  return `${theme.source.id}\u0000${theme.source.version}`
}

function decodeFont(font: ExternalThemeFont): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(font.data), (character) => character.charCodeAt(0))
}

/** Owns all plugin FontFace registrations for one webview document. */
export class ExternalFontManager {
  private cache = new Map<string, CachedPackage>()
  private activeKey: string | null = null
  private desiredThemeId: string | null = null
  private desiredKey: string | null = null
  private generation = 0
  private pendingFaces = new Map<number, FontFace[]>()
  private snapshot: ExternalTheme[] | null = null

  update(activeThemeId: string, themes: ExternalTheme[]): void {
    if (this.snapshot !== themes) {
      this.snapshot = themes
      this.invalidate()
    }

    const theme = themes.find((candidate) => candidate.id === activeThemeId)
    const key = theme ? packageKey(theme) : null
    if (key && this.desiredKey === key) {
      this.desiredThemeId = activeThemeId
      return
    }
    if (this.desiredThemeId === activeThemeId && this.desiredKey === key) return

    this.desiredThemeId = activeThemeId
    this.desiredKey = key
    const generation = ++this.generation
    this.unloadPending()
    this.unloadActive()
    if (!theme || !key) return

    const cached = this.cache.get(key)
    if (cached) {
      for (const face of cached.faces) document.fonts.add(face)
      this.activeKey = key
      return
    }

    void this.load(theme, key, generation)
  }

  dispose(): void {
    this.snapshot = null
    this.invalidate()
  }

  private invalidate(): void {
    this.generation += 1
    this.unloadPending()
    this.unloadActive()
    this.cache.clear()
    this.desiredThemeId = null
    this.desiredKey = null
  }

  private unloadActive(): void {
    if (!this.activeKey) return
    const active = this.cache.get(this.activeKey)
    if (active) {
      for (const face of active.faces) document.fonts.delete(face)
    }
    this.activeKey = null
  }

  private unloadPending(): void {
    for (const faces of this.pendingFaces.values()) {
      for (const face of faces) document.fonts.delete(face)
    }
    this.pendingFaces.clear()
  }

  private async load(theme: ExternalTheme, key: string, generation: number): Promise<void> {
    const added: FontFace[] = []
    this.pendingFaces.set(generation, added)
    try {
      const result = await api.themes.loadFonts(theme.id)
      if (generation !== this.generation) {
        this.pendingFaces.delete(generation)
        return
      }

      for (const font of result.fonts) {
        const face = new FontFace(font.family, decodeFont(font), {
          weight: String(font.weight),
          style: font.style,
        })
        await face.load()
        if (generation !== this.generation) {
          for (const stale of added) document.fonts.delete(stale)
          this.pendingFaces.delete(generation)
          return
        }
        document.fonts.add(face)
        added.push(face)
      }

      this.pendingFaces.delete(generation)
      this.cache.set(key, { faces: added })
      this.activeKey = key
    } catch (error) {
      for (const face of added) document.fonts.delete(face)
      this.pendingFaces.delete(generation)
      if (generation === this.generation) {
        console.error(`Failed to load fonts for external theme ${theme.id}:`, error)
      }
    }
  }
}

const externalFontManager = new ExternalFontManager()

export function updateExternalFonts(activeThemeId: string, themes: ExternalTheme[]): void {
  externalFontManager.update(activeThemeId, themes)
}

export function disposeExternalFonts(): void {
  externalFontManager.dispose()
}
