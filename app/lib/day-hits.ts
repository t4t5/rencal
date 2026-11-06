/*
 * The days on screen, for dropping dragged events and drawing new ones. Without
 * a DOM to query, each view registers where its days are; `dayAt` answers which
 * day lies under a point. Views hand over a function, since what they know
 * (scroll offsets, sizes) changes every frame but is only asked about in a drag.
 */
import { Temporal } from "@js-temporal/polyfill"

/**
 * What a day area covers, which decides what lands or is created there:
 *
 * - "day": a whole day, like a month cell. Any event moves there keeping its
 *   time; new events start after the day's last one.
 * - "all-day": a day in an all-day lane. Spanning events only; new events are all-day.
 * - "timed": a day column from 00:00 at its top to 24:00 at its bottom.
 *   Single-day timed events only, at the time under the pointer.
 */
export type DayZone = "day" | "all-day" | "timed"

export type Rect = { x: number; y: number; width: number; height: number }

export type DayArea = {
  day: Temporal.PlainDate
  zone: DayZone
  /** The whole day, in window coordinates: a "timed" column reaches past its scroll view. */
  rect: Rect
  /** What clips it on screen, if anything. */
  visible?: Rect
}

const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height

const sources = new Map<string, () => DayArea[]>()

/** Registers the areas of a view, or forgets them with null. */
export function setDayAreas(owner: string, areas: (() => DayArea[]) | null) {
  if (areas) sources.set(owner, areas)
  else sources.delete(owner)
}

/** The day under a window point. */
export function dayAt(x: number, y: number): DayArea | null {
  for (const areas of sources.values()) {
    const hit = areas().find(
      (area) => contains(area.rect, x, y) && (!area.visible || contains(area.visible, x, y)),
    )
    if (hit) return hit
  }
  return null
}

/** Where `day` is in `zone` now, even off screen. */
export function dayArea(day: Temporal.PlainDate, zone: DayZone): DayArea | null {
  for (const areas of sources.values()) {
    const hit = areas().find((area) => area.zone === zone && area.day.equals(day))
    if (hit) return hit
  }
  return null
}
