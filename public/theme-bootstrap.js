// Restore the theme before React mounts to avoid a flash. The theme controller
// caches which theme to show for each OS appearance; the window is unforced at
// launch, so the media query reports the OS. Before the first cache, the ren
// baseline shows.
try {
  const appearance = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  const theme = JSON.parse(localStorage.getItem("themeByAppearance"))?.[appearance]
  if (typeof theme === "string" && theme) {
    document.body.dataset.theme = theme

    // Apply the theme's last-known background so we don't flash a stale color
    // before the CSS bundle (and any external-theme <style>) loads.
    const background = JSON.parse(localStorage.getItem("themeBackgrounds"))?.[theme]
    if (typeof background === "string") {
      document.body.style.setProperty("--background", background)
      document.documentElement.style.backgroundColor = background
    }
  }
} catch {}
