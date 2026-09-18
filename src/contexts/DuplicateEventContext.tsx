import { useCallback, useMemo, useState, type ReactNode } from "react"

import { RecurrenceConfirmDialog } from "@/components/event-parts/RecurrenceConfirmDialog"
import { AGENDA_ITEM_SELECTOR } from "@/components/sidebar/agenda/useAgendaKeyboardNav"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, type DraftEvent } from "@/contexts/EventDraftContext"

import { getStoredEvent } from "@/lib/api/internal"
import { type CalendarEvent, type Recurrence } from "@/lib/cal-events"
import { conferenceForCalendar } from "@/lib/conference"
import { setDraftAnchor, type DraftAnchor } from "@/lib/draft-anchor"
import { getEventAnchor } from "@/lib/event-anchor"
import { isEventReadonly } from "@/lib/event-utils"
import { createStrictContext } from "@/lib/strict-context"

type PendingDuplicate = { event: CalendarEvent; anchor: DraftAnchor | null }

interface DuplicateEventContextValue {
  // Non-recurring events open the compose draft directly.
  // Recurring events show a dialog ("Only this event", "This and future events"...)
  triggerDuplicate: (event: CalendarEvent, anchor?: DraftAnchor | null) => void
}

const [DuplicateEventContextProvider, useDuplicateEvent] =
  createStrictContext<DuplicateEventContextValue>("DuplicateEvent")

export { useDuplicateEvent }

/**
 * Duplicate an event by opening the compose draft prefilled with a copy.
 * Saving goes through the normal create path, so the copy gets a fresh UID.
 * Owns the single This/Future/All dialog, so event blocks don't each mount their own.
 */
export function DuplicateEventProvider({ children }: { children: ReactNode }) {
  const { setActiveEventKey } = useCalEvents()
  const { calendars } = useCalendars()
  const {
    defaultCalendarId,
    setDraftEvent,
    setDraftReminders,
    setDraftPopoverOpen,
    setIsDrafting,
  } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const [pending, setPending] = useState<PendingDuplicate | null>(null)

  const openDuplicateDraft = useCallback(
    (source: CalendarEvent, recurrence: Recurrence | null, anchor?: DraftAnchor | null) => {
      const targetSlug = calendars.some((c) => c.slug === source.calendar_slug && !c.read_only)
        ? source.calendar_slug
        : defaultCalendarId
      if (!targetSlug) {
        promptToConnect()
        return
      }
      const targetCalendar = calendars.find((c) => c.slug === targetSlug)

      const draft: DraftEvent = {
        summary: source.summary,
        description: source.description,
        start: source.start,
        end: source.end,
        calendarId: targetSlug,
        location: source.location,
        url: source.url,
        recurrence,
        attendees: [...source.attendees],
        conference: conferenceForCalendar(source.conference, targetCalendar),
      }

      setActiveEventKey(null)
      setIsDrafting(false)
      setDraftEvent(draft)
      setDraftAnchor(anchor ?? resolveDuplicateAnchor())
      // setDraftPopoverOpen(true) resets reminders to the defaults, so the
      // copied reminders must be applied after it.
      setDraftPopoverOpen(true)
      setDraftReminders([...source.reminders])
    },
    [
      calendars,
      defaultCalendarId,
      promptToConnect,
      setActiveEventKey,
      setDraftEvent,
      setDraftPopoverOpen,
      setDraftReminders,
      setIsDrafting,
    ],
  )

  const triggerDuplicate = useCallback(
    (event: CalendarEvent, anchor?: DraftAnchor | null) => {
      if (isEventReadonly(event, calendars)) return
      if (!canCreate) {
        promptToConnect()
        return
      }
      if (event.recurring_event_id || event.recurrence) {
        setPending({ event, anchor: anchor ?? null })
        return
      }
      openDuplicateDraft(event, null, anchor)
    },
    [calendars, canCreate, promptToConnect, openDuplicateDraft],
  )

  const closeDialog = () => setPending(null)

  const handleDuplicateThis = () => {
    if (!pending) return
    const { event, anchor } = pending
    closeDialog()
    // A single occurrence becomes a standalone event: keep its expanded
    // range, drop the recurrence.
    openDuplicateDraft(event, null, anchor)
  }

  const handleDuplicateFuture = () => {
    if (!pending) return
    const { event, anchor } = pending
    closeDialog()
    // A new series anchored at this occurrence, carrying the same rule.
    // The original series is left untouched.
    openDuplicateDraft(event, event.master_recurrence ?? event.recurrence, anchor)
  }

  const handleDuplicateAll = async () => {
    if (!pending) return
    const { event, anchor } = pending
    closeDialog()
    // Duplicate the whole series from its master so the anchor date and
    // rule stay intact.
    if (event.recurring_event_id) {
      try {
        const master = await getStoredEvent({
          calendar_slug: event.calendar_slug,
          id: event.recurring_event_id,
        })
        if (master) {
          openDuplicateDraft(
            master,
            master.recurrence ?? master.master_recurrence ?? event.master_recurrence,
            anchor,
          )
          return
        }
      } catch (err) {
        console.error("get_event (duplicate master) failed:", err)
      }
    }
    openDuplicateDraft(event, event.recurrence ?? event.master_recurrence, anchor)
  }

  // Keep the value stable: every event block subscribes through EventContextMenu.
  const value = useMemo(() => ({ triggerDuplicate }), [triggerDuplicate])

  return (
    <DuplicateEventContextProvider value={value}>
      {children}
      <RecurrenceConfirmDialog
        isOpen={pending !== null}
        title="Duplicate recurring event"
        description="This event is part of a recurring series. Which events do you want to duplicate?"
        onClose={closeDialog}
        onApplyToThis={handleDuplicateThis}
        onApplyToFuture={handleDuplicateFuture}
        onApplyToAll={handleDuplicateAll}
      />
    </DuplicateEventContextProvider>
  )
}

/**
 * Where to anchor the duplicate draft when the caller has no element:
 * prefer the keyboard-focused agenda row, then the open edit popover's
 * anchor, then the viewport center.
 */
function resolveDuplicateAnchor(): DraftAnchor {
  const active = document.activeElement as HTMLElement | null
  const item = active?.closest(AGENDA_ITEM_SELECTOR) as HTMLElement | null
  if (item) {
    const rect = item.getBoundingClientRect()
    return { getBoundingClientRect: () => rect }
  }
  return (
    getEventAnchor() ?? {
      getBoundingClientRect: () =>
        new DOMRect(window.innerWidth / 2 - 175, window.innerHeight / 3, 0, 0),
    }
  )
}
