import { Temporal } from "@js-temporal/polyfill"

/** Convert a calendar day to the local components expected by JS Date consumers. */
export function plainDateToJsDate(date: Temporal.PlainDate): Date {
  return new Date(date.year, date.month - 1, date.day)
}

/** Read a calendar day from the local components returned by a JS Date producer. */
export function jsDateToPlainDate(date: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}
