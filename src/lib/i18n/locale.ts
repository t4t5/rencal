/**
 * A user's locale as a value object: the language picks the message catalog,
 * the full tag drives date and number formatting. Accepts both the POSIX form
 * the system reports (`de_DE.UTF-8`) and the BCP 47 form the WebView reports
 * (`de-DE`); "C" and "POSIX" carry no language and are rejected.
 */
const LOCALE_PATTERN = /^([a-z]{2,3})(?:[-_]([a-z]{2}|\d{3}))?$/i

export class Locale {
  private constructor(
    readonly language: string,
    readonly region: string | null,
  ) {}

  static parse(raw: string): Locale | null {
    const base = raw.split(/[.@]/)[0]
    const match = LOCALE_PATTERN.exec(base)
    if (!match) return null
    const language = match[1].toLowerCase()
    return new Locale(language, match[2]?.toUpperCase() ?? null)
  }

  get tag(): string {
    return this.region ? `${this.language}-${this.region}` : this.language
  }
}
