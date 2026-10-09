import { api } from "@/lib/api"
import type { ConfiguredLanguageSource } from "@/lib/i18n/ports"

/** Adapter: the optional `language` key in ~/.config/rencal/config.toml. */
export class ConfigTomlLanguage implements ConfiguredLanguageSource {
  configuredLanguage(): Promise<string | null> {
    return api.settings.getLanguage()
  }
}
