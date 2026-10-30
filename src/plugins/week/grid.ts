export const HOUR_HEIGHT = 48
export const GRID_HEIGHT = 24 * HOUR_HEIGHT
export const GUTTER_WIDTH = 48
export const DAY_MINUTES = 24 * 60

const WEEK_EVENT_RIGHT_GAP = 12

/**
 * Block edges shared with the create selection: the top covers the start hour's grid
 * line, the bottom stops short of the end hour's, and a right gap keeps the column clickable.
 */
export function weekEventBox(topPercent: number, heightPercent: number) {
  return {
    top: `calc(${topPercent}% - 1px)`,
    height: `max(calc(${heightPercent}% - 3px), 1rem)`,
    right: WEEK_EVENT_RIGHT_GAP,
  }
}

/** Places an overlap layout's shares within the width left of the right gap. */
export function overlapBox({
  left,
  width,
  coveredWidth,
}: {
  left: number
  width: number
  coveredWidth: number
}) {
  const area = `(100% - ${WEEK_EVENT_RIGHT_GAP}px)`
  return {
    left: `calc(${area} * ${left})`,
    width: `calc(${area} * ${width})`,
    right: "auto",
    // Wrap text before the neighbour drawn over this block's right edge.
    paddingRight: coveredWidth
      ? `calc(${area} * ${coveredWidth} + var(--event-padding-inline))`
      : undefined,
  }
}
