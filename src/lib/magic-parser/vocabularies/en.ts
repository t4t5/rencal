import * as chrono from "chrono-node"

import { type ParserVocabulary, type RecurrencePhrase, words } from "@/lib/magic-parser/vocabulary"

const WEEKDAYS: Record<string, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
}

const recurrences: RecurrencePhrase[] = [
  { pattern: words("every\\s+day"), rrule: "FREQ=DAILY" },
  { pattern: words("every\\s+week"), rrule: "FREQ=WEEKLY" },
  { pattern: words("every\\s+month"), rrule: "FREQ=MONTHLY" },
  { pattern: words("every\\s+year"), rrule: "FREQ=YEARLY" },
  { pattern: words("every\\s+weekday"), rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { pattern: words("every\\s+weekend"), rrule: "FREQ=WEEKLY;BYDAY=SA,SU" },
  ...Object.entries(WEEKDAYS).map(([day, code]) => ({
    pattern: words(`every\\s+(${day})`),
    rrule: `FREQ=WEEKLY;BYDAY=${code}`,
    keepGroup: 1,
  })),
]

export const ENGLISH: ParserVocabulary = {
  language: "en",
  chrono: chrono.en.casual,
  recurrences,
  reminders: {
    intro: "(?:with\\s+(?:a\\s+)?)?(?:reminders?|remind\\s+me)",
    outro: "(?:before(?:hand)?|earlier|in\\s+advance|ahead)",
    and: "(?:,\\s*and|,|and)",
    one: "(?:an?|one)",
    units: [
      ["minutes?|mins?|m", 1],
      ["hours?|hrs?|h", 60],
      ["days?|d", 1440],
      ["weeks?|w", 10080],
    ],
  },
  location: /\b(?:at|in)\s+(.+)$/i,
  connectorsBeforeDate: /\b(?:at|on|for|from)\s*$/i,
}
