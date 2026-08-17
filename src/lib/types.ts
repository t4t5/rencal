import { Temporal } from "@js-temporal/polyfill"
import { ComponentType } from "react"

export interface DateRange {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
}

export type IconType = ComponentType<{ className?: string }>
