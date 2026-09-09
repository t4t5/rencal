import { Temporal } from "@js-temporal/polyfill"
import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import {
  minutesAtY,
  selectionForPointer,
  selectionRange,
  type CreateSelection,
} from "@/lib/drag-to-create"
import { DAY_MINUTES, formatDateKey } from "@/lib/event-time"

type ActiveCreateSelection = CreateSelection & { dayKey: string }
type TimedAnchor = {
  day: Temporal.PlainDate
  dayKey: string
  anchorMinutes: number
}

export function useDragToCreate(scrollContainerRef: RefObject<HTMLDivElement | null>): {
  selection: ActiveCreateSelection | null
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
} {
  const openDayDraft = useOpenDayDraft()
  const session = useDragToCreateSession<TimedAnchor, ActiveCreateSelection>({
    scrollContainerRef,
    selectionAt: (anchor, originEl, pointer) => ({
      dayKey: anchor.dayKey,
      ...selectionForPointer(
        anchor.anchorMinutes,
        minutesAtY(originEl.getBoundingClientRect(), pointer.y),
      ),
    }),
    isSameSelection: (a, b) =>
      a.dayKey === b.dayKey && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes,
    onCommit: (selection, anchor, originEl) => {
      const range = selectionRange(anchor.day, selection)
      const rect = originEl.getBoundingClientRect()
      const midpointMinutes = (selection.startMinutes + selection.endMinutes) / 2
      const anchorY = rect.top + (midpointMinutes / DAY_MINUTES) * rect.height
      openDayDraft(anchor.day, originEl, {
        allDay: false,
        start: range.start,
        end: range.end,
        anchorY,
      })
    },
  })

  const startCreateDrag = useCallback(
    (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => {
      session.startCreateDrag(
        {
          day,
          dayKey: formatDateKey(day),
          anchorMinutes: minutesAtY(event.currentTarget.getBoundingClientRect(), event.clientY),
        },
        event,
      )
    },
    [session.startCreateDrag],
  )

  return { selection: session.selection, startCreateDrag }
}
