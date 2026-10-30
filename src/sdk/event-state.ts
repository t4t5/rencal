import type { CalendarEvent as AppEvent } from "@/lib/cal-events"

// Drafts are app events built per keystroke; remember which ones so blocks can
// tell them apart from saved events without a field on the plugin event.
const drafts = new WeakSet<AppEvent>()

export function markDraft(event: AppEvent) {
  drafts.add(event)
}

export function isDraft(event: AppEvent): boolean {
  return drafts.has(event)
}
