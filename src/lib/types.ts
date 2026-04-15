import { ComponentType } from "react"

export interface DateRange {
  start: Date
  end: Date
}

export type IconType = ComponentType<{ className?: string }>
