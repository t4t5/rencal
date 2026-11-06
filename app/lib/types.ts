import { Temporal } from "@js-temporal/polyfill"
import type { JSX } from "nsh"

export interface DateRange {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
}

export type IconType = (props: { class?: string }) => JSX.Element
