import { useEffect, type RefObject } from "react"

const FOCUSABLE_SELECTOR = [
  "textarea:not([disabled]):not([readonly])",
  "input:not([disabled]):not([readonly])",
  "select:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

const INTERACTIVE_FOCUS_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='textbox']",
].join(",")

function getFocusableElements(content: HTMLElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.tabIndex < 0) return false
    if (el.getAttribute("aria-disabled") === "true") return false
    if (el.getAttribute("aria-hidden") === "true") return false

    const style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden") return false
    if (style.pointerEvents === "none") return false
    if (!el.getClientRects().length) return false

    return true
  })
}

// Entering the popover lands on the title (the first text field), not on
// header buttons like "…" that precede it in DOM order.
function entryField(focusables: HTMLElement[], reverse: boolean) {
  if (reverse) return focusables[focusables.length - 1]
  return focusables.find((el) => el.matches("textarea, input")) ?? focusables[0]
}

let activePopoverContent: HTMLElement | null = null

export function focusEventPopoverField(reverse = false): boolean {
  if (!activePopoverContent) return false

  const focusables = getFocusableElements(activePopoverContent)
  if (!focusables.length) return false

  entryField(focusables, reverse)?.focus()
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

    const content = contentRef.current
    activePopoverContent = content

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      const content = contentRef.current
      const activeElement = document.activeElement as HTMLElement | null

      if (!content) return

      const activeIsInsidePopover = activeElement ? content.contains(activeElement) : false
      const activeIsInFormControl = activeElement?.closest(INTERACTIVE_FOCUS_SELECTOR)

      if (!activeIsInsidePopover && activeIsInFormControl) return

      const focusables = getFocusableElements(content)
      if (!focusables.length) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const activeIndex = activeElement ? focusables.indexOf(activeElement) : -1

      if (activeIndex === -1) {
        entryField(focusables, e.shiftKey)?.focus()
        return
      }

      const nextIndex =
        (activeIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length

      focusables[nextIndex]?.focus()
    }

    window.addEventListener("keydown", handleTab, { capture: true })
    return () => {
      if (activePopoverContent === content) activePopoverContent = null
      window.removeEventListener("keydown", handleTab, { capture: true })
    }
  }, [enabled, contentRef])
}
