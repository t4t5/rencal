/*
 * Named regions of the window, for annotate mode to say what a note points at.
 * Without a DOM to query, a view opts in with `ref={inspectable(...)}`; regions
 * are measured only when annotate mode asks. A floating region (a popover)
 * hides what lies beneath it.
 */
import type { ViewRef } from "nsh"

import type { Rect } from "@/lib/day-hits"

export type Region = { name: string; source: string; rect: Rect; floating: boolean }

const refs = new Map<string, { source: string; ref: ViewRef; floating: boolean }>()

/** A ref that registers its view as region `name`, defined in `source`. */
export const inspectable =
  (name: string, source: string, options?: { floating?: boolean }) => (ref: ViewRef) => {
    refs.set(name, { source, ref, floating: options?.floating ?? false })
  }

/** Every registered region in the tree now, in window coordinates. */
export async function measureRegions(): Promise<Region[]> {
  const measured = await Promise.all(
    [...refs].map(async ([name, { source, ref, floating }]) => {
      const m = await ref.measure()
      if (!m) return null
      const { width, height } = m.bounds.size
      const rect = { x: m.pagePosition.x, y: m.pagePosition.y, width, height }
      return { name, source, rect, floating }
    }),
  )
  return measured.filter((region): region is Region => region !== null)
}

const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height

const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

/** The regions under a point, innermost first; over a floating region, only it and what's in it. */
export function regionsAt(regions: Region[], x: number, y: number): Region[] {
  const under = regions
    .filter(({ rect }) => contains(rect, x, y))
    .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)
  const top = under.find((region) => region.floating)
  return top ? under.filter((region) => within(region.rect, top.rect)) : under
}
