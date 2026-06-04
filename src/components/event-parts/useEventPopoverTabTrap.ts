import { useEffect, type RefObject } from "react"

const EVENT_EDIT_FOCUSABLE_SELECTOR = [
  "textarea:not([disabled]):not([readonly])",
  "input:not([disabled]):not([readonly])",
  "select:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function getEventEditFocusables(content: HTMLElement): HTMLElement[] {
  const scope = content.querySelector<HTMLElement>("[data-event-edit-fields]") ?? content

  return Array.from(scope.querySelectorAll<HTMLElement>(EVENT_EDIT_FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.getAttribute("aria-disabled") === "true") return false
      if (el.getAttribute("aria-hidden") === "true") return false

      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden") return false
      if (style.pointerEvents === "none") return false
      if (!el.getClientRects().length) return false

      return true
    },
  )
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
      if (!content) return

      const focusables = getEventEditFocusables(content)
      if (!focusables.length) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const activeElement = document.activeElement as HTMLElement | null
      const activeIndex = activeElement ? focusables.indexOf(activeElement) : -1
      const nextIndex =
        activeIndex === -1
          ? e.shiftKey
            ? focusables.length - 1
            : 0
          : (activeIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length

      focusables[nextIndex]?.focus()
    }

    window.addEventListener("keydown", handleTab, { capture: true })
    return () => window.removeEventListener("keydown", handleTab, { capture: true })
  }, [enabled, contentRef])
}
