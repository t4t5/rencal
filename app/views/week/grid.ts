import { type TimedBlock } from "@/lib/layout"

export const HOUR_HEIGHT = 48
export const GRID_HEIGHT = 24 * HOUR_HEIGHT
export const GUTTER_WIDTH = 48

const RIGHT_GAP = 12

/**
 * A block's box in a day column `dayWidth` wide. The top covers the start hour's
 * grid line, the bottom stops short of the end hour's, and a right gap keeps the
 * column clickable.
 */
export function eventBox(block: TimedBlock<unknown>, dayWidth: number) {
  const area = dayWidth - RIGHT_GAP
  return {
    ...verticalBox(block.top, block.height),
    left: area * block.left,
    width: area * block.width,
    // Wraps text before the neighbour drawn over this block's right edge.
    coveredWidth: area * block.coveredWidth,
  }
}

/** The vertical part of a box, from percentages of the day. */
export function verticalBox(topPercent: number, heightPercent: number) {
  return {
    top: (topPercent / 100) * GRID_HEIGHT - 1,
    height: Math.max((heightPercent / 100) * GRID_HEIGHT - 3, 16),
  }
}

/** A create selection's width in a column. */
export const selectionWidth = (dayWidth: number) => dayWidth - RIGHT_GAP
