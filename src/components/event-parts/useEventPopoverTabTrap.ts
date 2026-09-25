import { useEffect, type RefObject } from "react"

// Mirrors the browser's own Tab order, so native Tab and the trap agree on
// every stop. Controls opt out via `disabled` or tabIndex={-1}, not here.
const TABBABLE_SELECTOR = "textarea, input, select, button, [tabindex]"

const INTERACTIVE_FOCUS_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='textbox']",
].join(",")

function getTabbableElements(content: HTMLElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter((el) => {
    if (el.tabIndex < 0 || el.matches(":disabled")) return false

    const style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden") return false
    if (!el.getClientRects().length) return false

    return true
  })
}

// Entering the popover lands on the first marked entry point (the title, or
// "Join" when the title is read-only), not on header buttons like "…" that
// precede it in DOM order.
function entryField(tabbables: HTMLElement[], reverse: boolean) {
  if (reverse) return tabbables[tabbables.length - 1]
  return (
    tabbables.find((el) => el.matches("[data-popover-entry]")) ??
    tabbables.find((el) => el.matches("textarea, input")) ??
    tabbables[0]
  )
}

// Found by DOM position, so focus on a non-stop (e.g. a clicked read-only
// field) still moves to its neighbour instead of back to the title.
function nextTabbable(tabbables: HTMLElement[], from: HTMLElement, reverse: boolean) {
  if (reverse) {
    return tabbables.findLast(
      (el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING,
    )
  }
  return tabbables.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
}

let activePopoverContent: HTMLElement | null = null

export function focusEventPopoverField(reverse = false): boolean {
  if (!activePopoverContent) return false

  const tabbables = getTabbableElements(activePopoverContent)
  if (!tabbables.length) return false

  entryField(tabbables, reverse)?.focus()
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

      const tabbables = getTabbableElements(content)
      if (!tabbables.length) return

      // The popover container itself takes focus on clicks between fields.
      const entering = !activeElement || !activeIsInsidePopover || activeElement === content

      // Let the browser move between fields so it preserves keyboard focus
      // styling (:focus-visible), and each field can handle Tab itself.
      // Only take over when entering the popover or wrapping at an edge.
      if (!entering && nextTabbable(tabbables, activeElement, e.shiftKey)) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      if (entering) {
        entryField(tabbables, e.shiftKey)?.focus()
        return
      }

      const wrapTarget = e.shiftKey ? tabbables[tabbables.length - 1] : tabbables[0]
      wrapTarget?.focus()
    }

    window.addEventListener("keydown", handleTab, { capture: true })
    return () => {
      if (activePopoverContent === content) activePopoverContent = null
      window.removeEventListener("keydown", handleTab, { capture: true })
    }
  }, [enabled, contentRef])
}
