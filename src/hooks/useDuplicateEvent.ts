import { useState } from "react"

import { AGENDA_ITEM_SELECTOR } from "@/components/sidebar/agenda/useAgendaKeyboardNav"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, type DraftEvent } from "@/contexts/EventDraftContext"

import { rpcToCalendarEvent, type CalendarEvent, type Recurrence } from "@/lib/cal-events"
import { conferenceForCalendar } from "@/lib/conference"
import { setDraftAnchor, type DraftAnchor } from "@/lib/draft-anchor"
import { getEventAnchor } from "@/lib/event-anchor"
import { isEventReadonly } from "@/lib/event-utils"

/**
 * Duplicate an event by opening the compose draft prefilled with a copy.
 * Saving goes through the normal create path, so the copy gets a fresh UID.
 * Recurring events pause on a This/Future/All dialog before opening the draft.
 */
export function useDuplicateEvent() {
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
  const [pendingEvent, setPendingEvent] = useState<CalendarEvent | null>(null)
  const [pendingAnchor, setPendingAnchor] = useState<DraftAnchor | null>(null)

  const openDuplicateDraft = (
    source: CalendarEvent,
    recurrence: Recurrence | null,
    anchor?: DraftAnchor | null,
  ) => {
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
  }

  const triggerDuplicate = (event: CalendarEvent, anchor?: DraftAnchor | null) => {
    if (isEventReadonly(event, calendars)) return
    if (!canCreate) {
      promptToConnect()
      return
    }
    if (event.recurring_event_id || event.recurrence) {
      setPendingEvent(event)
      setPendingAnchor(anchor ?? null)
      return
    }
    openDuplicateDraft(event, null, anchor)
  }

  const closeDialog = () => {
    setPendingEvent(null)
    setPendingAnchor(null)
  }

  const handleDuplicateThis = () => {
    if (!pendingEvent) return
    const source = pendingEvent
    const anchor = pendingAnchor
    closeDialog()
    // A single occurrence becomes a standalone event: keep its expanded
    // range, drop the recurrence.
    openDuplicateDraft(source, null, anchor)
  }

  const handleDuplicateFuture = () => {
    if (!pendingEvent) return
    const source = pendingEvent
    const anchor = pendingAnchor
    closeDialog()
    // A new series anchored at this occurrence, carrying the same rule.
    // The original series is left untouched.
    openDuplicateDraft(source, source.master_recurrence ?? source.recurrence, anchor)
  }

  const handleDuplicateAll = async () => {
    if (!pendingEvent) return
    const source = pendingEvent
    const anchor = pendingAnchor
    closeDialog()
    // Duplicate the whole series from its master so the anchor date and
    // rule stay intact.
    if (source.recurring_event_id) {
      try {
        const masterRpc = await rpc.caldir.get_event(
          source.calendar_slug,
          source.recurring_event_id,
        )
        if (masterRpc) {
          const master = rpcToCalendarEvent(masterRpc)
          openDuplicateDraft(
            master,
            master.recurrence ?? master.master_recurrence ?? source.master_recurrence,
            anchor,
          )
          return
        }
      } catch (err) {
        console.error("get_event (duplicate master) failed:", err)
      }
    }
    openDuplicateDraft(source, source.recurrence ?? source.master_recurrence, anchor)
  }

  return {
    triggerDuplicate,
    duplicateDialogProps: {
      open: pendingEvent !== null,
      onClose: closeDialog,
      onDuplicateThis: handleDuplicateThis,
      onDuplicateFuture: handleDuplicateFuture,
      onDuplicateAll: handleDuplicateAll,
    },
  }
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
