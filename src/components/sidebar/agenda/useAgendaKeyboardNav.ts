import { formatDateKey } from "@/lib/event-time"
import { AGENDA_ITEM_SELECTOR, NATIVE_TAB_SCOPE_SELECTOR } from "@/lib/focus-selectors"

export function isInNativeTabScope(target: EventTarget | null = document.activeElement): boolean {
  return !!(target as HTMLElement | null)?.closest(NATIVE_TAB_SCOPE_SELECTOR)
}

export function isAgendaItemFocused(target: EventTarget | null = document.activeElement): boolean {
  return !!(target as HTMLElement | null)?.closest(AGENDA_ITEM_SELECTOR)
}

let lastFocusedAgendaEventKey: string | null = null

export function rememberFocusedAgendaItem(item: HTMLElement): void {
  lastFocusedAgendaEventKey = item.dataset.eventKey ?? null
}

export function clearRememberedAgendaItem(): void {
  lastFocusedAgendaEventKey = null
}

export function focusAgendaItem(delta: 1 | -1, activeDate: Date): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>(AGENDA_ITEM_SELECTOR))
  if (!items.length) return

  const active = document.activeElement as HTMLElement | null
  const activeIndex = active ? items.indexOf(active) : -1
  const rememberedIndex =
    activeIndex === -1 && lastFocusedAgendaEventKey
      ? items.findIndex((item) => item.dataset.eventKey === lastFocusedAgendaEventKey)
      : -1
  const currentIndex = activeIndex !== -1 ? activeIndex : rememberedIndex

  if (currentIndex !== -1) {
    const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + delta))
    focusItem(items[nextIndex])
    return
  }

  const activeKey = formatDateKey(activeDate)
  const targetDay = items.some((item) => item.dataset.dateKey === activeKey)
    ? activeKey
    : items.find((item) => item.dataset.dateKey && item.dataset.dateKey > activeKey)?.dataset
        .dateKey

  const candidates = targetDay
    ? items.filter((item) => item.dataset.dateKey === targetDay)
    : [items[items.length - 1]]

  const firstTimed = candidates.find((item) => item.dataset.allDay !== "true")
  focusItem(firstTimed ?? candidates[0])
}

function focusItem(item: HTMLElement | undefined) {
  if (!item) return
  rememberFocusedAgendaItem(item)
  item.focus({ preventScroll: true })
  item.scrollIntoView({ block: "nearest" })
}
