// Click behaviour for copy buttons rendered by src/components/CopyButton.astro
// and by the "ren-copy-button" expressive-code plugin in ec.config.mjs.
// Both load this file, so guard against registering the listener twice.
if (!document.documentElement.dataset.copyButtonsReady) {
  document.documentElement.dataset.copyButtonsReady = "true"

  document.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return

    const button = event.target.closest("[data-copy-command]")
    if (!button) return

    const command = button.getAttribute("data-copy-command")
    if (!command) return

    try {
      await navigator.clipboard.writeText(command)
    } catch {
      return
    }

    const copyIcon = button.querySelector("[data-icon-copy]")
    const checkIcon = button.querySelector("[data-icon-check]")

    copyIcon?.setAttribute("hidden", "")
    checkIcon?.removeAttribute("hidden")
    window.setTimeout(() => {
      copyIcon?.removeAttribute("hidden")
      checkIcon?.setAttribute("hidden", "")
    }, 1800)
  })
}
