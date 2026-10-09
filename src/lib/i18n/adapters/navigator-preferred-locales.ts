import type { PreferredLocalesSource } from "@/lib/i18n/ports"

type NavigatorLanguages = Pick<Navigator, "language"> & { languages: readonly string[] }

/**
 * Adapter: the WebView's language list. WebKitGTK derives it from the
 * process locale (LANG / LC_MESSAGES), WebView2 and WKWebView from the OS.
 */
export class NavigatorPreferredLocales implements PreferredLocalesSource {
  constructor(private readonly nav: NavigatorLanguages) {}

  preferredLocales(): readonly string[] {
    return this.nav.languages.length > 0 ? this.nav.languages : [this.nav.language]
  }
}
