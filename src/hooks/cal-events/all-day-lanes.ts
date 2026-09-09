import type { CalendarEvent } from "@/lib/cal-events"

export type AllDaySpan = {
  startCol: number // 1-based CSS grid-column-start
  endCol: number // 1-based CSS grid-column-end (exclusive)
  isStart: boolean
  isEnd: boolean
}

export type AllDayLaneItem = AllDaySpan & {
  event: CalendarEvent
  calendarColor: string | null
  lane: number
}

export function clipSpanToRange(
  firstDay: number,
  lastDay: number,
  rangeFirstDay: number,
  rangeLastDay: number,
): AllDaySpan | null {
  if (firstDay > rangeLastDay || lastDay < rangeFirstDay) return null

  const clampedFirstDay = Math.max(firstDay, rangeFirstDay)
  const clampedLastDay = Math.min(lastDay, rangeLastDay)

  return {
    startCol: clampedFirstDay - rangeFirstDay + 1,
    endCol: clampedLastDay - rangeFirstDay + 2,
    isStart: firstDay >= rangeFirstDay,
    isEnd: lastDay <= rangeLastDay,
  }
}

export function buildAllDaySpan(
  event: CalendarEvent,
  rangeFirstDay: number,
  rangeLastDay: number,
  calendarColor: string | null,
): AllDayLaneItem | null {
  const span = clipSpanToRange(
    event.dateInfo.firstDay,
    event.dateInfo.lastDay,
    rangeFirstDay,
    rangeLastDay,
  )
  if (!span) return null

  return {
    ...span,
    event,
    calendarColor,
    lane: 0,
  }
}

export function firstFreeLane(
  items: { startCol: number; endCol: number; lane: number }[],
  startCol: number,
  endCol: number,
): number {
  const occupied = new Set(
    items
      .filter((item) => item.startCol < endCol && item.endCol > startCol)
      .map((item) => item.lane),
  )
  let lane = 0
  while (occupied.has(lane)) lane++
  return lane
}

export function assignAllDayLanes(items: AllDayLaneItem[], columnCount: number): number {
  items.sort((a, b) => {
    const spanDiff = b.endCol - b.startCol - (a.endCol - a.startCol)
    return spanDiff || a.startCol - b.startCol
  })

  const laneOccupied: boolean[][] = []
  let maxLane = -1

  for (const item of items) {
    let lane = 0
    while (true) {
      if (!laneOccupied[lane]) {
        laneOccupied[lane] = Array(columnCount).fill(false) as boolean[]
      }
      let fits = true
      for (let column = item.startCol - 1; column < item.endCol - 1; column++) {
        if (laneOccupied[lane][column]) {
          fits = false
          break
        }
      }
      if (fits) break
      lane++
    }

    if (!laneOccupied[lane]) {
      laneOccupied[lane] = Array(columnCount).fill(false) as boolean[]
    }
    for (let column = item.startCol - 1; column < item.endCol - 1; column++) {
      laneOccupied[lane][column] = true
    }
    item.lane = lane
    maxLane = Math.max(maxLane, lane)
  }

  return maxLane
}
