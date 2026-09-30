/** Host-only operations that are not part of the public renCal client. */
export {
  deleteRecurringSeries,
  getStoredEvent,
  replaceEvent,
  splitRecurringSeriesAt,
  type ReplaceEventInput,
  type SplitRecurringSeriesInput,
} from "@/lib/api/calendar-events"
export { emitAppEvent } from "@/lib/api/notifications"
export { needsNativeDecorations, takePendingEventLinks } from "@/lib/api/platform"
