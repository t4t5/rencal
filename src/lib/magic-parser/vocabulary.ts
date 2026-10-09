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
 * How a reminder is written, e.g. "mit Erinnerung 1 Stunde vorher". All fields
 * are regex sources; the parser joins them into one phrase pattern.
 */
export interface ReminderWords {
  /** Words that start the phrase ("with a reminder", "mit Erinnerung"). */
  intro: string
  /** Optional words after the amounts ("before", "vorher"). */
  outro: string
  /** Separator between several amounts (",", "and", "und"). */
  and: string
  /** Words that mean the number one ("a", "an", "einen"). */
  one: string
  /** Unit words with their length in minutes, longest spellings first. */
  units: ReadonlyArray<readonly [source: string, minutes: number]>
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
  reminders: ReminderWords
  /** Words left dangling before a removed date, e.g. "at" in "Lunch at tomorrow". */
  connectorsBeforeDate: RegExp
}

/** Case-insensitive pattern with Unicode-aware word boundaries (umlauts count as letters). */
export function words(source: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "iu")
}
