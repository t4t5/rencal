/*
 * Named regions of the window, for annotate mode to say what a note points at.
 * Without a DOM to query, a view opts in with `ref={inspectable(...)}`; regions
 * are measured only when annotate mode asks.
 */
import type { ViewRef } from "nsh"

import type { Rect } from "@/lib/day-hits"

export type Region = { name: string; source: string; rect: Rect }

const refs = new Map<string, { source: string; ref: ViewRef }>()

/** A ref that registers its view as region `name`, defined in `source`. */
export const inspectable = (name: string, source: string) => (ref: ViewRef) => {
  refs.set(name, { source, ref })
}

/** Every registered region in the tree now, in window coordinates. */
export async function measureRegions(): Promise<Region[]> {
  const measured = await Promise.all(
    [...refs].map(async ([name, { source, ref }]) => {
      const m = await ref.measure()
      if (!m) return null
      const { width, height } = m.bounds.size
      return { name, source, rect: { x: m.pagePosition.x, y: m.pagePosition.y, width, height } }
    }),
  )
  return measured.filter((region): region is Region => region !== null)
}

/** The regions under a point, innermost first. */
export function regionsAt(regions: Region[], x: number, y: number): Region[] {
  return regions
    .filter(
      ({ rect }) =>
        x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
    )
    .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)
}
