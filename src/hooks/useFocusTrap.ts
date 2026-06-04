import { RefObject, useEffect } from "react"

// The usual "tabbable" set; [tabindex="-1"] and disabled controls are filtered out below.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function getTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // offsetParent is null for display:none elements — skip those.
    (el) => el.tabIndex !== -1 && el.offsetParent !== null,
  )
}

// While `active`, keep Tab / Shift+Tab cycling within `containerRef` instead of
// escaping to the rest of the page. The tabbable set is re-read on every Tab, so
// controls that mount/unmount while the trap stays active are picked up without
// re-running the effect. Open popovers/dialogs portal their content outside the
// container and run their own focus trap, so this only governs the container's
// own controls (the closed-state triggers).
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      const tabbables = getTabbables(container)
      if (tabbables.length === 0) return

      const first = tabbables[0]
      const last = tabbables[tabbables.length - 1]
      const focused = document.activeElement

      if (e.shiftKey) {
        if (focused === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (focused === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener("keydown", onKeyDown)
    return () => container.removeEventListener("keydown", onKeyDown)
  }, [active, containerRef])
}
