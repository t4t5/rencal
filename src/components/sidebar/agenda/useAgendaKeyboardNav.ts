import { formatDateKey } from "@/lib/event-time"

export const AGENDA_EL_ID = "agenda-scroll-container"
export const AGENDA_ITEM_SELECTOR = "[data-agenda-item]"
export const NATIVE_TAB_SCOPE_SELECTOR = "[data-native-tab-scope]"

export function isInNativeTabScope(target: EventTarget | null = document.activeElement): boolean {
  return !!(target as HTMLElement | null)?.closest(NATIVE_TAB_SCOPE_SELECTOR)
}

export function focusAgendaItem(delta: 1 | -1, activeDate: Date): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>(AGENDA_ITEM_SELECTOR))
  if (!items.length) return

  const active = document.activeElement as HTMLElement | null
  const currentIndex = active ? items.indexOf(active) : -1

  if (currentIndex !== -1) {
    focusItem(items[Math.min(items.length - 1, Math.max(0, currentIndex + delta))])
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
  item.focus({ preventScroll: true })
  item.scrollIntoView({ block: "nearest" })
}
