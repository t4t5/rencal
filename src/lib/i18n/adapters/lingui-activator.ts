import type { I18n, Messages } from "@lingui/core"

import type { Locale } from "@/lib/i18n/locale"
import type { LocaleActivator } from "@/lib/i18n/ports"

/**
 * Adapter: activates the catalog in Lingui by language, tells the followers
 * (date formatting, the quick-add parser) the locale, and sets <html lang> for
 * the WebView's own controls and hyphenation.
 */
export class LinguiActivator implements LocaleActivator {
  constructor(
    private readonly i18n: I18n,
    private readonly followers: ReadonlyArray<(locale: Locale) => void>,
    private readonly htmlElement: { lang: string },
  ) {}

  activate(locale: Locale, messages: Messages): void {
    this.i18n.loadAndActivate({ locale: locale.language, messages })
    for (const follow of this.followers) follow(locale)
    this.htmlElement.lang = locale.tag
  }
}
