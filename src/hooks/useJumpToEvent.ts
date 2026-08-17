import { useCallback } from "react"

import { scrollElementIntoContainer } from "@/components/sidebar/agenda/scrollSectionIntoContainer"
import {
  AGENDA_ITEM_SELECTOR,
  AGENDA_SCROLL_CONTAINER_SELECTOR,
} from "@/components/sidebar/agenda/useAgendaKeyboardNav"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { formatDateKey, dateInViewerZone } from "@/lib/event-time"

const MAX_ANCHOR_FRAMES = 30

export function useJumpToEvent(): (event: CalendarEvent) => Promise<void> {
  const { setActiveEventKey } = useCalEvents()
  const { navigateToDate } = useCalendarNavigation()

  return useCallback(
    async (event: CalendarEvent) => {
      const date = dateInViewerZone(event.start)
      const dateKey = formatDateKey(date)
      const masterKey = eventKey(event)

      await navigateToDate(date, "instant")

      const row = await findAgendaRow((candidate) => {
        if (candidate.dataset.dateKey !== dateKey) return false

        const candidateKey = candidate.dataset.eventKey
        return (
          candidateKey === masterKey ||
          (!!event.recurrence && candidateKey?.startsWith(`${masterKey}__`) === true)
        )
      })

      if (!row?.dataset.eventKey) return

      const container = row.closest<HTMLElement>(AGENDA_SCROLL_CONTAINER_SELECTOR)
      if (container) {
        const scrollPaddingTop =
          Number.parseFloat(getComputedStyle(container).scrollPaddingTop) || 0
        scrollElementIntoContainer(container, row, "instant", scrollPaddingTop)
      }

      setEventAnchor(row)
      setActiveEventKey(row.dataset.eventKey)
    },
    [navigateToDate, setActiveEventKey],
  )
}

function findAgendaRow(matches: (row: HTMLElement) => boolean): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    let frame = 0

    const find = () => {
      const row = Array.from(document.querySelectorAll<HTMLElement>(AGENDA_ITEM_SELECTOR)).find(
        matches,
      )

      if (row || frame >= MAX_ANCHOR_FRAMES) {
        resolve(row ?? null)
        return
      }

      frame += 1
      requestAnimationFrame(find)
    }

    requestAnimationFrame(find)
  })
}
