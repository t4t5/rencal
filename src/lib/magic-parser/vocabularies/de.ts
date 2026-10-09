import * as chrono from "chrono-node"

import { type ParserVocabulary, type RecurrencePhrase, words } from "@/lib/magic-parser/vocabulary"

const WEEKDAYS: Record<string, string> = {
  montag: "MO",
  dienstag: "TU",
  mittwoch: "WE",
  donnerstag: "TH",
  freitag: "FR",
  samstag: "SA",
  sonntag: "SU",
}

const recurrences: RecurrencePhrase[] = [
  { pattern: words("jeden\\s+tag|täglich"), rrule: "FREQ=DAILY" },
  { pattern: words("jede\\s+woche|wöchentlich"), rrule: "FREQ=WEEKLY" },
  { pattern: words("jeden\\s+monat|monatlich"), rrule: "FREQ=MONTHLY" },
  { pattern: words("jedes\\s+jahr|jährlich"), rrule: "FREQ=YEARLY" },
  { pattern: words("jeden\\s+werktag|werktags"), rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { pattern: words("jedes\\s+wochenende|wochenends"), rrule: "FREQ=WEEKLY;BYDAY=SA,SU" },
  // "jeden Montag" and "montags": keep "Montag" so chrono finds the first date.
  ...Object.entries(WEEKDAYS).flatMap(([day, code]) => [
    { pattern: words(`jeden\\s+(${day})`), rrule: `FREQ=WEEKLY;BYDAY=${code}`, keepGroup: 1 },
    { pattern: words(`(${day})s`), rrule: `FREQ=WEEKLY;BYDAY=${code}`, keepGroup: 1 },
  ]),
]

export const GERMAN: ParserVocabulary = {
  language: "de",
  chrono: chrono.de.casual,
  recurrences,
  reminders: {
    intro: "(?:mit\\s+(?:(?:einer|der)\\s+)?)?(?:erinnerung(?:en)?|erinnere\\s+mich)",
    outro: "(?:vorher|davor|zuvor|vor\\s+beginn)",
    and: "(?:,|und)",
    one: "(?:ein(?:e|en|em|er)?)",
    units: [
      ["minuten?|min\\.?|m", 1],
      ["stunden?|std\\.?|h", 60],
      ["tagen?|tage|tag", 1440],
      ["wochen?", 10080],
    ],
  },
  location: /(?<![\p{L}\p{N}])(?:in|im|bei)\s+(.+)$/iu,
  connectorsBeforeDate: /(?<![\p{L}\p{N}])(?:um|am|ab|vom|von|für|zum)\s*$/iu,
}
