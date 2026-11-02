import { DAY_MINUTES } from "@/lib/event-time"

/** A timed event's box in a day column: `top`/`height` in percent, the rest as shares of its width. */
export type TimedBox = {
  top: number
  height: number
  /** Share of the day's width left of the event. */
  left: number
  width: number
  /** Share at the right edge drawn over by a neighbour, kept clear of text. */
  coveredWidth: number
}

/** Overlapping events starting this much later nest on top instead of sharing columns. */
const NEST_AFTER = (30 / DAY_MINUTES) * 100
/** Indent of a nested event past the left edges of the events beneath it. */
const NEST_INDENT = 0.1
/** Nesting never narrows an event below this share of the day's width. */
const MIN_NESTED_WIDTH = 0.5
/** How far an event extends under its right-hand neighbour, as a share of one column. */
const COLUMN_OVERLAP = 0.4
/** Tolerance for float precision when comparing positions derived from minute-based math */
const OVERLAP_EPS = 1e-5

/** Events starting at about the same time, sharing the width right of `left` in columns. */
type Cluster<T> = {
  start: number
  left: number
  columns: T[][]
}

const endOf = (ev: TimedBox) => ev.top + ev.height

function overlaps(a: TimedBox, b: TimedBox) {
  return a.top < endOf(b) - OVERLAP_EPS && b.top < endOf(a) - OVERLAP_EPS
}

/**
 * Lays out overlapping timed events Google Calendar style: events starting together
 * sit side by side, each extending under its right-hand neighbour and widening into
 * columns left free; events starting later nest on top, indented so the titles beneath
 * stay visible. Sets each box's `left`, `width` and `coveredWidth` from its `top` and
 * `height`, and reorders `events` into paint order, back to front.
 */
export function layoutTimedOverlaps<T extends TimedBox>(events: T[]) {
  events.sort((a, b) => a.top - b.top || b.height - a.height)

  const clusters: Cluster<T>[] = []
  const clusterOf = new Map<T, Cluster<T>>()
  const columnOf = new Map<T, number>()

  // Final for every cluster that can no longer gain columns, which nesting guarantees.
  const leftOf = (ev: T) => {
    const cluster = clusterOf.get(ev)!
    const share = (1 - cluster.left) / cluster.columns.length
    return cluster.left + columnOf.get(ev)! * share
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const active = events.slice(0, i).filter((placed) => endOf(placed) > ev.top + OVERLAP_EPS)

    let newest: Cluster<T> | undefined
    for (const placed of active) {
      const cluster = clusterOf.get(placed)!
      if (!newest || cluster.start > newest.start) newest = cluster
    }

    let cluster = newest
    if (!cluster || ev.top - cluster.start >= NEST_AFTER) {
      const left = active.length
        ? Math.min(Math.max(...active.map(leftOf)) + NEST_INDENT, 1 - MIN_NESTED_WIDTH)
        : 0
      cluster = { start: ev.top, left, columns: [] }
      clusters.push(cluster)
    }

    let col = cluster.columns.findIndex((column) => endOf(column.at(-1)!) <= ev.top + OVERLAP_EPS)
    if (col === -1) col = cluster.columns.push([]) - 1
    cluster.columns[col].push(ev)
    clusterOf.set(ev, cluster)
    columnOf.set(ev, col)
  }

  for (const { left, columns } of clusters) {
    const share = (1 - left) / columns.length
    columns.forEach((column, col) => {
      for (const ev of column) {
        let span = 1
        while (col + span < columns.length && !columns[col + span].some((o) => overlaps(o, ev))) {
          span++
        }
        ev.left = left + col * share
        ev.coveredWidth = col + span < columns.length ? share * COLUMN_OVERLAP : 0
        ev.width = span * share + ev.coveredWidth
      }
    })
  }

  // Later clusters nest over earlier ones, and each column over the one to its left.
  const clusterIndex = new Map(clusters.map((cluster, index) => [cluster, index]))
  events.sort(
    (a, b) =>
      clusterIndex.get(clusterOf.get(a)!)! - clusterIndex.get(clusterOf.get(b)!)! ||
      columnOf.get(a)! - columnOf.get(b)!,
  )
}
