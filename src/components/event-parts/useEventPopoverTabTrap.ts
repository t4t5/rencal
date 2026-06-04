import { useEffect, type RefObject } from "react"

const EVENT_POPOVER_SELECTOR = "[data-event-popover]"
const EVENT_EDIT_FIELDS_SELECTOR = "[data-event-edit-fields]"
const NATIVE_TAB_SCOPE_SELECTOR = "[data-native-tab-scope]"

const FOCUSABLE_SELECTOR = [
  "textarea:not([disabled]):not([readonly])",
  "input:not([disabled]):not([readonly])",
  "select:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function getFocusableElements(content: HTMLElement): HTMLElement[] {
  const scope = content.querySelector<HTMLElement>(EVENT_EDIT_FIELDS_SELECTOR) ?? content

  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute("aria-disabled") === "true") return false
    if (el.getAttribute("aria-hidden") === "true") return false

    const style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden") return false
    if (style.pointerEvents === "none") return false
    if (!el.getClientRects().length) return false

    return true
  })
}

export function focusEventPopoverField(reverse = false): boolean {
  const content = document.querySelector<HTMLElement>(EVENT_POPOVER_SELECTOR)
  if (!content) return false

  const focusables = getFocusableElements(content)
  if (!focusables.length) return false

  focusables[reverse ? focusables.length - 1 : 0]?.focus()
  return true
}

export function useEventPopoverTabTrap({
  enabled,
  contentRef,
}: {
  enabled: boolean
  contentRef: RefObject<HTMLElement | null>
}) {
  useEffect(() => {
    if (!enabled) return

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      const content = contentRef.current
      const activeElement = document.activeElement as HTMLElement | null

      if (!content) return

      const activeIsInsidePopover = activeElement ? content.contains(activeElement) : false
      const activeIsInAnotherNativeTabScope =
        activeElement?.closest(NATIVE_TAB_SCOPE_SELECTOR) && !activeIsInsidePopover

      if (activeIsInAnotherNativeTabScope) return

      const focusables = getFocusableElements(content)
      if (!focusables.length) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const activeIndex = activeElement ? focusables.indexOf(activeElement) : -1

      if (activeIndex === -1) {
        focusables[e.shiftKey ? focusables.length - 1 : 0]?.focus()
        return
      }

      const nextIndex =
        (activeIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length

      focusables[nextIndex]?.focus()
    }

    window.addEventListener("keydown", handleTab, { capture: true })
    return () => window.removeEventListener("keydown", handleTab, { capture: true })
  }, [enabled, contentRef])
}
