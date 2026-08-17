import type { CalendarEvent } from "@/lib/cal-events"

export type AllDayLaneItem = {
  event: CalendarEvent
  calendarColor: string | null
  startCol: number // 1-based CSS grid-column-start
  endCol: number // 1-based CSS grid-column-end (exclusive)
  lane: number
  isStart: boolean
  isEnd: boolean
}

export function buildAllDaySpan(
  event: CalendarEvent,
  rangeFirstDay: number,
  rangeLastDay: number,
  calendarColor: string | null,
): AllDayLaneItem | null {
  const { firstDay, lastDay } = event.dateInfo
  if (firstDay > rangeLastDay || lastDay < rangeFirstDay) return null

  const clampedFirstDay = Math.max(firstDay, rangeFirstDay)
  const clampedLastDay = Math.min(lastDay, rangeLastDay)

  return {
    event,
    calendarColor,
    startCol: clampedFirstDay - rangeFirstDay + 1,
    endCol: clampedLastDay - rangeFirstDay + 2,
    lane: 0,
    isStart: firstDay >= rangeFirstDay,
    isEnd: lastDay <= rangeLastDay,
  }
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
