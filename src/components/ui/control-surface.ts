/**
 * Shared active-state paint for form-control surfaces.
 *
 * Each primitive still chooses the selector that matches its interaction model:
 * direct inputs use `focus`, composite inputs use `focus-within`, and popup
 * triggers use `focus-visible` and/or Radix's open state.
 */
const controlSurfaceActive = {
  focus: "focus:border-(--control-active-border) focus:bg-(--control-active-background)",
  focusVisible:
    "focus-visible:border-(--control-active-border) focus-visible:bg-(--control-active-background)",
  focusWithin:
    "focus-within:border-(--control-active-border) focus-within:bg-(--control-active-background)",
  open: "[&[data-state=open]:not([aria-invalid=true])]:border-(--control-active-border) data-[state=open]:bg-(--control-active-background)",
} as const

export { controlSurfaceActive }
