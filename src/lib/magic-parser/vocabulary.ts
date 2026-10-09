import type { Chrono } from "chrono-node"

/** One way to say a recurrence, e.g. "every monday" → FREQ=WEEKLY;BYDAY=MO. */
export interface RecurrencePhrase {
  pattern: RegExp
  rrule: string
  /**
   * Capture group whose text stays in the input for chrono, so "every monday at 9"
   * still resolves the first Monday. Without it the whole phrase is removed.
   */
  keepGroup?: number
}

/**
 * The words the quick-add parser understands in one language: chrono's date
 * grammar plus the parser's own recurrence, location and connector words.
 * Parser vocabulary, not UI text: it lives here, not in the message catalogs.
 */
export interface ParserVocabulary {
  language: string
  chrono: Chrono
  recurrences: readonly RecurrencePhrase[]
  /** Trailing location; capture group 1 is the place. */
  location: RegExp
  /** Words left dangling before a removed date, e.g. "at" in "Lunch at tomorrow". */
  connectorsBeforeDate: RegExp
}

/** Case-insensitive pattern with Unicode-aware word boundaries (umlauts count as letters). */
export function words(source: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "iu")
}
