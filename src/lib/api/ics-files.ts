import { rpc } from "@/rpc"
import type {
  IcsImportDestination,
  IcsImportResult as RpcIcsImportResult,
  IcsImportTarget,
  IcsPreview as RpcIcsPreview,
  IcsSourceCalendar as RpcIcsSourceCalendar,
} from "@/rpc/bindings"

import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"
import type { EventTime } from "@/lib/event-time"
import { fromRpcEventTime } from "@/lib/event-time/rpc"

export type { IcsImportDestination, IcsImportTarget }

/** A calendar found in an .ics file; its index is an import target's `source`. */
export type IcsSourceCalendar = Omit<RpcIcsSourceCalendar, "first_start" | "last_start"> & {
  first_start: EventTime
  last_start: EventTime
}

export type IcsPreview = Omit<RpcIcsPreview, "calendars" | "event"> & {
  calendars: IcsSourceCalendar[]
  /** The file's only event (a series counts as one), e.g. an invite. */
  event: CalendarEvent | null
}

export type IcsImportResult = Omit<RpcIcsImportResult, "event"> & {
  /** Set when exactly one event was imported. */
  event: CalendarEvent | null
}

/** What an .ics file holds. Nothing is written. */
export async function previewIcsFile(path: string): Promise<IcsPreview> {
  const preview = await rpc.caldir.preview_ics(path)
  return {
    ...preview,
    calendars: preview.calendars.map((calendar) => ({
      ...calendar,
      first_start: fromRpcEventTime(calendar.first_start),
      last_start: fromRpcEventTime(calendar.last_start),
    })),
    event: preview.event && rpcToCalendarEvent(preview.event),
  }
}

/** Copy the chosen calendars of an .ics file; events already there are skipped. */
export async function importIcsFile(
  path: string,
  targets: IcsImportTarget[],
): Promise<IcsImportResult> {
  const result = await rpc.caldir.import_ics(path, targets)
  return { ...result, event: result.event && rpcToCalendarEvent(result.event) }
}

export const icsFiles = {
  preview: previewIcsFile,
  import: importIcsFile,
} as const
